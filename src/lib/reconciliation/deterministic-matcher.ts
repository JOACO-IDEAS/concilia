// Matcher determinístico — RECONCILIATION_MATCHING_ARCHITECTURE.md §9. Aplica
// todos los bloqueos duros y agrega la evaluación de cada candidato
// (unidad, titular) del universo generado por candidate-generator.ts en un
// único resultado: CANDIDATE / AMBIGUOUS / BLOCKED. Nunca escribe nada.

import type { Prisma } from "@/generated/prisma/client";
import type { Blocker, CandidateEvaluation, CandidateStatus, Signal } from "./types";
import type { CandidateObligation, CandidateOwner, CandidateUniverse } from "./candidate-generator";
import type { ObligacionCandidata } from "./amount-policy";
import {
  calcularSenalCuit,
  calcularSenalEmail,
  calcularSenalFecha,
  construirSenalHistorialPagos,
  calcularSenalImporte,
  calcularSenalNombre,
  calcularSenalReferencia,
  calcularSenalUnitCode,
} from "./signals";
import { calcularConfianza } from "./confidence-engine";
import { soloDigitos } from "./text-utils";

export interface PaymentInput {
  id: string;
  amount: number;
  payerIdentifier: string | null;
  concept: string | null;
  transactionDate: Date | null;
  referenceNumber: string | null;
}

export interface MatchContext {
  // Canal futuro (WhatsApp/PaymentNotice) — un pago bancario normal no trae
  // ninguno de los dos, ver FASE_3_3_IMPLEMENTATION_PLAN.md §5.
  email?: string | null;
}

export interface CandidateEntry extends CandidateEvaluation {
  unitCode: string;
  ownerFullName: string | null;
}

export interface DeterministicMatchOutput {
  candidates: CandidateEntry[]; // ordenados por score desc
  globalBlockers: Blocker[];
  status: CandidateStatus;
  winner: CandidateEntry | null;
}

// Provisorio — a calibrar en modo sombra con datos reales
// (RECONCILIATION_MATCHING_ARCHITECTURE.md §11), no un valor definitivo.
const MARGEN_AMBIGUEDAD = 10;

function mapObligacion(o: CandidateObligation): ObligacionCandidata {
  return { id: o.id, period: o.period, amount: o.amount, paidAmount: o.paidAmount };
}

export async function evaluarDeterministico(
  tx: Prisma.TransactionClient,
  payment: PaymentInput,
  universe: CandidateUniverse,
  context: MatchContext = {}
): Promise<DeterministicMatchOutput> {
  const globalBlockers: Blocker[] = [];

  if (universe.units.length === 0) {
    globalBlockers.push({
      type: "NO_UNITS_IN_ORGANIZATION",
      evidence: "La organización no tiene unidades cargadas todavía.",
    });
    return { candidates: [], globalBlockers, status: "BLOCKED", winner: null };
  }

  // Estas dos preguntas antes se resolvían una vez por candidato dentro de
  // la transacción interactiva. Ambas dependen sólo de la lista completa de
  // unidades y del pago actual, por lo que una lectura batch es exactamente
  // equivalente y mantiene el mismo snapshot transaccional.
  const unitIds = universe.units.map((unit) => unit.id);
  const [pagosHistoricos, rechazosPrevios] = await Promise.all([
    tx.paymentTransaction.findMany({
      where: {
        unitId: { in: unitIds },
        status: "MATCHED",
        amount: payment.amount,
        id: { not: payment.id },
      },
      select: { unitId: true },
    }),
    tx.reconciliationMatch.findMany({
      where: {
        paymentTransactionId: payment.id,
        unitId: { in: unitIds },
        decision: "REJECTED",
      },
      select: { unitId: true },
    }),
  ]);
  const unitIdsConHistorial = new Set(pagosHistoricos.flatMap((pago) => (pago.unitId ? [pago.unitId] : [])));
  const unitIdsRechazadas = new Set(rechazosPrevios.flatMap((rechazo) => (rechazo.unitId ? [rechazo.unitId] : [])));

  // Código de unidad extraído del concepto — ¿matchea más de una unidad?
  const senalCodigoPorUnidad = new Map<string, Signal>();
  for (const unit of universe.units) {
    senalCodigoPorUnidad.set(unit.id, calcularSenalUnitCode(payment.concept, unit.code));
  }
  const unidadesConCodigo = universe.units.filter((u) => senalCodigoPorUnidad.get(u.id)!.matched);
  if (unidadesConCodigo.length > 1) {
    globalBlockers.push({
      type: "UNIT_CODE_AMBIGUOUS",
      evidence: `El código de unidad extraído del concepto coincide con ${unidadesConCodigo.length} unidades distintas (${unidadesConCodigo.map((u) => u.code).join(", ")}) — nunca se adivina cuál es.`,
    });
  }

  // ¿El CUIT del pago pertenece a algún titular real de la organización?
  // (para poder detectar, más abajo, cuando se evalúa un candidato distinto).
  const cuitDigits = payment.payerIdentifier ? soloDigitos(payment.payerIdentifier) : "";
  let ownerConCuitCoincidente: string | null = null;
  if (cuitDigits) {
    for (const unit of universe.units) {
      const owner = unit.owners.find((o) => o.taxId && soloDigitos(o.taxId) === cuitDigits);
      if (owner) {
        ownerConCuitCoincidente = owner.id;
        break;
      }
    }
  }

  const candidatos: CandidateEntry[] = [];

  for (const unit of universe.units) {
    const titulares: (CandidateOwner | null)[] = unit.owners.length > 0 ? unit.owners : [null];

    for (const owner of titulares) {
      const signals: Signal[] = [];
      signals.push(calcularSenalCuit(payment.payerIdentifier, owner?.taxId ?? null));
      signals.push(senalCodigoPorUnidad.get(unit.id)!);

      const { signal: senalImporte, assessment } = calcularSenalImporte(
        payment.amount,
        unit.openObligations.map(mapObligacion)
      );
      signals.push(senalImporte);

      const obligacionRelevante =
        unit.openObligations.find((o) => o.id === assessment.obligationId) ?? unit.openObligations[0] ?? null;
      signals.push(calcularSenalFecha(payment.transactionDate, obligacionRelevante));
      signals.push(calcularSenalReferencia(payment.referenceNumber, obligacionRelevante?.externalRef ?? null));

      if (owner) signals.push(calcularSenalNombre(payment.concept, owner.fullName));
      if (context.email !== undefined) {
        signals.push(calcularSenalEmail(context.email ?? null, owner?.email ?? null));
      }

      signals.push(construirSenalHistorialPagos(unitIdsConHistorial.has(unit.id), payment.amount));

      const blockers: Blocker[] = [];

      // Rechazo previo, scoped exactamente por (paymentTransactionId, unitId)
      // — nunca por unitId solo (regla ya aprobada, no propaga a otros pagos).
      if (unitIdsRechazadas.has(unit.id)) {
        blockers.push({
          type: "PREVIOUSLY_REJECTED",
          evidence: "Esta unidad ya fue rechazada como candidato para este pago puntual.",
        });
      }

      // CUIT contradictorio: el pago tiene un CUIT que pertenece a OTRO
      // titular real de la organización, distinto del que se evalúa acá.
      if (ownerConCuitCoincidente && (!owner || owner.id !== ownerConCuitCoincidente)) {
        blockers.push({
          type: "CUIT_CONTRADICTORY",
          evidence: "El CUIT del pago pertenece a otro titular de esta organización, no al que se está evaluando.",
        });
      }

      if (assessment.category === "SUPERIOR_SIN_EXPLICAR" || assessment.category === "AGRUPADO") {
        blockers.push({ type: "AMOUNT_INCOMPATIBLE", evidence: assessment.evidence });
      }

      const confianza = calcularConfianza(signals);
      const tieneBloqueoPropio = blockers.length > 0;

      // El score REFLEJA la evidencia real, nunca se fuerza a 0 por tener un
      // bloqueo — si se forzara, "el mejor candidato real está bloqueado"
      // sería indistinguible de "no hay evidencia" (ver más abajo, donde se
      // usa el score real para elegir `primero` y recién DESPUÉS se decide
      // si ese candidato queda BLOCKED). `wouldQualifyForAuto` sí queda en
      // `false` con cualquier bloqueo propio, sin excepción.
      candidatos.push({
        unitId: unit.id,
        unitOwnerId: owner?.id ?? null,
        obligationId: assessment.obligationId,
        signals,
        blockers,
        tier: confianza.tier,
        score: confianza.score,
        wouldQualifyForAuto: !tieneBloqueoPropio && confianza.wouldQualifyForAuto,
        unitCode: unit.code,
        ownerFullName: owner?.fullName ?? null,
      });
    }
  }

  candidatos.sort((a, b) => b.score - a.score);
  const mejor = candidatos[0] as CandidateEntry | undefined;

  // Duplicado — mismo importe ya conciliado (AUTO/APPROVED) para la unidad
  // del mejor candidato real, en un ReconciliationMatch de OTRO
  // PaymentTransaction. Es un bloqueo global: aplica sin importar si `mejor`
  // en sí tiene o no otros bloqueos propios.
  if (mejor?.unitId) {
    const posibleDuplicado = await tx.reconciliationMatch.findFirst({
      where: {
        unitId: mejor.unitId,
        decision: { in: ["AUTO", "APPROVED"] },
        paymentTransactionId: { not: payment.id },
        paymentTransaction: { amount: payment.amount },
      },
      select: { id: true },
    });
    if (posibleDuplicado) {
      globalBlockers.push({
        type: "DUPLICATE",
        evidence: "Ya existe un pago conciliado con el mismo importe para esta unidad — posible duplicado.",
      });
    }
  }

  if (globalBlockers.length > 0) {
    return { candidates: candidatos, globalBlockers, status: "BLOCKED", winner: null };
  }

  if (!mejor || mejor.score === 0) {
    globalBlockers.push({
      type: "INSUFFICIENT_EVIDENCE",
      evidence: "Ninguna señal disponible permite proponer un candidato para este pago.",
    });
    return { candidates: candidatos, globalBlockers, status: "BLOCKED", winner: null };
  }

  // El candidato con más evidencia real está, él mismo, bloqueado — se
  // reporta EXACTAMENTE por qué (nunca se degrada silenciosamente a "sin
  // evidencia", que perdería el motivo real).
  if (mejor.blockers.length > 0) {
    return {
      candidates: candidatos,
      globalBlockers: [...globalBlockers, ...mejor.blockers],
      status: "BLOCKED",
      winner: null,
    };
  }

  // Ambigüedad: comparar solo contra rivales SIN bloqueos propios — un
  // candidato bloqueado no es un rival legítimo para desempatar.
  //
  // Fase 3.9 — regla estructural (RECONCILIATION_MATCHING_ARCHITECTURE.md
  // §8.2 ya establecía la jerarquía de tiers; esto la aplica también acá,
  // no solo al score). Un rival solo cuenta como "empate legítimo" si
  // alcanza el MISMO tier más fuerte que el ganador — nunca si su tier es
  // más débil, sin importar cuán cerca esté en score.
  //
  // Motivo: `PUNTOS_POR_TIER[2] - PUNTOS_POR_TIER[3] = MARGEN_AMBIGUEDAD`
  // (22-12=10=10) — antes de esta regla, un importe EXACTO (tier 2) contra
  // la obligación de una unidad puntual quedaba "empatado" con un importe
  // PARCIAL (tier 3) de CUALQUIER otra unidad con deuda mayor, porque
  // PARCIAL es cierto para toda unidad cuyo saldo pendiente supere el pago
  // — no es evidencia de identidad hacia esa unidad puntual, es aritmética
  // que se cumple casi siempre. Comparar tiers distintos como si fueran
  // intercambiables mezclaba evidencia fuerte con evidencia estructuralmente
  // más débil. La comparación de ambigüedad ahora respeta la MISMA jerarquía
  // de tiers que ya gobierna el resto del sistema — no se tocó ningún
  // número de PUNTOS_POR_TIER/MARGEN_AMBIGUEDAD/TIER_POR_CATEGORIA_IMPORTE.
  //
  // Dos candidatos genuinamente equivalentes (mismo tier, score cercano)
  // siguen produciendo AMBIGUOUS exactamente igual que antes — esta regla
  // no relaja la ambigüedad, solo evita comparar cosas de fuerza distinta.
  const limpios = candidatos.filter((c) => c.blockers.length === 0);
  const rivalesDeIgualTier = limpios.filter((c) => c !== mejor && c.tier === mejor.tier);
  const segundoLimpio = rivalesDeIgualTier[0];
  const empatado = segundoLimpio && segundoLimpio.score > 0 && mejor.score - segundoLimpio.score <= MARGEN_AMBIGUEDAD;
  if (empatado) {
    const cantidadEmpatados = [mejor, ...rivalesDeIgualTier].filter(
      (c) => mejor.score - c.score <= MARGEN_AMBIGUEDAD && c.score > 0
    ).length;
    globalBlockers.push({
      type: "MULTIPLE_EQUIVALENT_CANDIDATES",
      evidence: `Hay ${cantidadEmpatados} candidatos con evidencia comparable, sin un ganador claro.`,
    });
    return { candidates: candidatos, globalBlockers, status: "AMBIGUOUS", winner: null };
  }

  return { candidates: candidatos, globalBlockers, status: "CANDIDATE", winner: mejor };
}
