// Fase 5.7 — Payment Evidence Score, implementado exactamente según
// FASE_5_7_PAYMENT_EVIDENCE_SCORE_DESIGN.md (Partes 4-7). Capa de
// EVALUACIÓN/ORQUESTACIÓN pura sobre evidencia ya calculada por los motores
// existentes — NUNCA re-matchea, nunca escribe, nunca es un segundo motor.
//
// Entrada: el resultado YA CALCULADO de `runMatchingInShadow` (BANK_MOVEMENT)
// y/o de `evaluarEvidenciaDeComprobante` (WHATSAPP_MESSAGE) — ambos
// consumidos como caja opaca, sin desagregar de nuevo sus señales internas.
// Eso es, literalmente, cómo se evita el doble conteo (Parte 4/11 del
// diseño): la fortaleza interna de cada motor cuenta UNA vez, como el score
// de SU familia — nunca se vuelve a sumar señal por señal acá arriba.
//
// HISTORY se deja deliberadamente MISSING siempre: el único dato histórico
// real disponible hoy (`PAYMENT_HISTORY`, `signals.ts::calcularSenalHistorialPagos`)
// ya está sumado DENTRO del score de BANK_MOVEMENT — tratarlo además como
// familia independiente acá sería exactamente el doble conteo que este
// diseño prohíbe. Además, `ReconciliationMatch` tiene 0 filas reales
// (confirmado en Fase 5.3/5.5), así que no hay ningún dato real que computar
// de todos modos. No se inventa ninguna fuente histórica nueva esta fase.

import type { ResultadoIngestaEvidencia } from "./types";
import type { ShadowMatchResult, Tier } from "@/lib/reconciliation/types";

export type EvidenceFamilyName = "WHATSAPP_MESSAGE" | "BANK_MOVEMENT" | "HISTORY";

export type EvidenceNature = "POSITIVE" | "NEGATIVE" | "CONTRADICTORY" | "MISSING";

export interface EvidenceFamilyResult {
  family: EvidenceFamilyName;
  nature: EvidenceNature;
  present: boolean; // ¿esta familia tiene algún dato para evaluar, sea cual sea el resultado?
  unitId: string | null;
  unitCode: string | null;
  score: number | null; // reutilizado del motor que ya lo calculó — nunca inventado acá
  tier: Tier | null;
  detail: string;
}

export type PaymentEvidenceState =
  | "INFORMATIONAL"
  | "NEEDS_DATA"
  | "NEEDS_DECISION"
  | "PRE_CONCILIABLE"
  | "RECONCILIATION_CONFIRMED";

export interface PaymentEvidenceAssessment {
  state: PaymentEvidenceState;
  families: EvidenceFamilyResult[]; // siempre las 3 (WHATSAPP_MESSAGE, BANK_MOVEMENT, HISTORY), incluso MISSING
  // Familias con nature=POSITIVE que convergen en la MISMA unidad — nunca
  // cuenta doble una familia, nunca cuenta PADRON/OBLIGATION (no son
  // parámetros de esta función: son contexto interno de cada motor).
  independentFamiliesConverging: EvidenceFamilyName[];
  hasContradiction: boolean;
  contradictionDetail: string | null;
  explanation: string;
}

// Blockers que representan evidencia genuinamente CONTRADICTORIA (dos
// fuentes reales en desacuerdo explícito) — nunca simplemente "falta algo".
// Lista cerrada, tomada tal cual de reconciliation/types.ts — no se agregan
// valores nuevos.
const BLOCKERS_CONTRADICTORIOS = new Set(["IDENTITY_CONFLICT", "CUIT_CONTRADICTORY"]);

function tieneBlockerContradictorio(blockers: { type: string; evidence: string }[]): string | null {
  const b = blockers.find((x) => BLOCKERS_CONTRADICTORIOS.has(x.type));
  return b ? b.evidence : null;
}

/**
 * BANK_MOVEMENT — consume `ShadowMatchResult` ya calculado por
 * `runMatchingInShadow` (sin tocarlo, sin re-ejecutarlo). `null` = no hay
 * ningún PaymentTransaction correlacionado todavía (Casos B/G del diseño).
 */
export function evaluarFamiliaBankMovement(bank: ShadowMatchResult | null): EvidenceFamilyResult {
  if (!bank) {
    return {
      family: "BANK_MOVEMENT",
      nature: "MISSING",
      present: false,
      unitId: null,
      unitCode: null,
      score: null,
      tier: null,
      detail: "No hay ningún movimiento bancario (PaymentTransaction) correlacionado todavía.",
    };
  }

  const contradiccion = tieneBlockerContradictorio(bank.blockers);
  if (contradiccion) {
    return {
      family: "BANK_MOVEMENT",
      nature: "CONTRADICTORY",
      present: true,
      unitId: bank.candidateUnitId,
      unitCode: null,
      score: bank.score,
      tier: bank.tier,
      detail: contradiccion,
    };
  }

  if (bank.status === "CANDIDATE") {
    // topCandidates[0] equivale al ganador real cuando status=CANDIDATE: se
    // arma desde el mismo `resultado.candidates` (ya ordenado desc) del que
    // sale `winner` — ver match-engine.ts::construirTopCandidates. No se
    // recalcula nada, solo se lee el mismo dato dos veces.
    const unitCode = bank.topCandidates?.[0]?.unitCode ?? null;
    return {
      family: "BANK_MOVEMENT",
      nature: "POSITIVE",
      present: true,
      unitId: bank.candidateUnitId,
      unitCode,
      score: bank.score,
      tier: bank.tier,
      detail: bank.explanation,
    };
  }

  // BLOCKED (sin contradicción) o AMBIGUOUS — evidencia negativa: hay datos,
  // pero no alcanzan (o no desempatan) para proponer un candidato.
  return {
    family: "BANK_MOVEMENT",
    nature: "NEGATIVE",
    present: true,
    unitId: null,
    unitCode: null,
    score: bank.score,
    tier: bank.tier,
    detail: bank.explanation,
  };
}

/**
 * WHATSAPP_MESSAGE — consume `ResultadoIngestaEvidencia` ya calculado por
 * `evaluarEvidenciaDeComprobante` (sin tocarlo, sin re-ejecutarlo). `null` =
 * no llegó ningún comprobante de WhatsApp para este pago.
 */
export function evaluarFamiliaWhatsapp(whatsapp: ResultadoIngestaEvidencia | null): EvidenceFamilyResult {
  if (!whatsapp) {
    return {
      family: "WHATSAPP_MESSAGE",
      nature: "MISSING",
      present: false,
      unitId: null,
      unitCode: null,
      score: null,
      tier: null,
      detail: "No llegó ningún comprobante de WhatsApp para este pago.",
    };
  }

  const contradiccion = tieneBlockerContradictorio(whatsapp.blockers);
  if (contradiccion) {
    return {
      family: "WHATSAPP_MESSAGE",
      nature: "CONTRADICTORY",
      present: true,
      unitId: whatsapp.candidatoPropuesto?.unitId ?? null,
      unitCode: whatsapp.candidatoPropuesto?.unitCode ?? null,
      score: whatsapp.candidatoPropuesto?.score ?? null,
      tier: whatsapp.candidatoPropuesto?.tier ?? null,
      detail: contradiccion,
    };
  }

  if (whatsapp.estado === "CANDIDATE" && whatsapp.candidatoPropuesto) {
    return {
      family: "WHATSAPP_MESSAGE",
      nature: "POSITIVE",
      present: true,
      unitId: whatsapp.candidatoPropuesto.unitId,
      unitCode: whatsapp.candidatoPropuesto.unitCode,
      score: whatsapp.candidatoPropuesto.score,
      tier: whatsapp.candidatoPropuesto.tier,
      detail: whatsapp.explicacion,
    };
  }

  // AMBIGUOUS, BLOCKED (sin contradicción) o SIN_IDENTIDAD — evidencia
  // negativa: llegó un mensaje, pero no resolvió un candidato usable.
  return {
    family: "WHATSAPP_MESSAGE",
    nature: "NEGATIVE",
    present: true,
    unitId: null,
    unitCode: null,
    score: whatsapp.candidatoPropuesto?.score ?? null,
    tier: whatsapp.candidatoPropuesto?.tier ?? null,
    detail: whatsapp.explicacion,
  };
}

/**
 * HISTORY — deliberadamente MISSING siempre esta fase. Ver comentario de
 * cabecera del archivo: activarla hoy sería doble conteo (ya está dentro del
 * score de BANK_MOVEMENT vía PAYMENT_HISTORY) y no hay ningún dato real
 * (`ReconciliationMatch` con 0 filas) para computar de todos modos. No se
 * inventa ninguna métrica ni dato histórico — ver Parte 13 del pedido.
 */
export function evaluarFamiliaHistorial(): EvidenceFamilyResult {
  return {
    family: "HISTORY",
    nature: "MISSING",
    present: false,
    unitId: null,
    unitCode: null,
    score: null,
    tier: null,
    detail:
      "HISTORY no se computa esta fase: la única señal histórica real (PAYMENT_HISTORY) ya está sumada dentro de BANK_MOVEMENT — tratarla también acá sería doble conteo. ReconciliationMatch no tiene filas reales todavía.",
  };
}

const TIER_IMPORTE_NO_EXACTO: Tier = 3; // PARCIAL/EXCEDENTE, ver signals.ts::TIER_POR_CATEGORIA_IMPORTE

function importeBancarioNoExacto(bank: ShadowMatchResult | null): boolean {
  if (!bank || bank.status !== "CANDIDATE") return false;
  const senalImporte = bank.signals.find((s) => s.signal === "AMOUNT_MATCH");
  return senalImporte !== undefined && senalImporte.matched && senalImporte.tier >= TIER_IMPORTE_NO_EXACTO;
}

export interface PaymentEvidenceInputs {
  bank?: ShadowMatchResult | null;
  whatsapp?: ResultadoIngestaEvidencia | null;
}

/**
 * Combina las familias de evidencia y determina el estado — reglas
 * estructurales exactas de FASE_5_7_PAYMENT_EVIDENCE_SCORE_DESIGN.md Partes
 * 5/6/7. Nunca escribe nada, nunca dispara nada — AUTO sigue completamente
 * deshabilitado: esto es una evaluación en memoria, no una acción. Alcanzar
 * `RECONCILIATION_CONFIRMED` acá NUNCA crea un `ReconciliationMatch` ni
 * modifica ninguna tabla — sigue requiriendo una decisión humana explícita,
 * fuera del alcance de esta función.
 */
export function evaluarPaymentEvidenceScore(inputs: PaymentEvidenceInputs): PaymentEvidenceAssessment {
  const bank = inputs.bank ?? null;
  const whatsapp = inputs.whatsapp ?? null;

  const familiaBanco = evaluarFamiliaBankMovement(bank);
  const familiaWhatsapp = evaluarFamiliaWhatsapp(whatsapp);
  const familiaHistorial = evaluarFamiliaHistorial();
  const families = [familiaWhatsapp, familiaBanco, familiaHistorial];

  // 1) Contradicción — máxima prioridad, nunca se promedia ni se resuelve
  // por score (mismo principio que los hard blockers del motor real).
  let hasContradiction = false;
  let contradictionDetail: string | null = null;

  const familiaContradictoria = families.find((f) => f.nature === "CONTRADICTORY");
  if (familiaContradictoria) {
    hasContradiction = true;
    contradictionDetail = familiaContradictoria.detail;
  } else if (
    familiaBanco.nature === "POSITIVE" &&
    familiaWhatsapp.nature === "POSITIVE" &&
    familiaBanco.unitId &&
    familiaWhatsapp.unitId &&
    familiaBanco.unitId !== familiaWhatsapp.unitId
  ) {
    // Contradicción CRUZADA entre familias: ninguno de los dos motores la
    // detecta por sí solo (cada uno se evalúa sin saber del otro) — es
    // exactamente el tipo de evidencia que esta capa, y solo esta capa,
    // puede ver.
    hasContradiction = true;
    contradictionDetail = `BANK_MOVEMENT propone UF ${familiaBanco.unitCode ?? familiaBanco.unitId}, pero WHATSAPP_MESSAGE propone UF ${familiaWhatsapp.unitCode ?? familiaWhatsapp.unitId} — evaluados independientemente, no coinciden.`;
  }

  if (hasContradiction) {
    return {
      state: "NEEDS_DECISION",
      families,
      independentFamiliesConverging: [],
      hasContradiction: true,
      contradictionDetail,
      explanation: contradictionDetail ?? "Evidencia contradictoria entre familias.",
    };
  }

  // 2) Ambigüedad sin contradicción — hay más de un candidato plausible.
  const bancoAmbiguo = bank !== null && bank.status === "AMBIGUOUS";
  const whatsappAmbiguo = whatsapp !== null && whatsapp.estado === "AMBIGUOUS";
  if (bancoAmbiguo || whatsappAmbiguo) {
    return {
      state: "NEEDS_DECISION",
      families,
      independentFamiliesConverging: [],
      hasContradiction: false,
      contradictionDetail: null,
      explanation: "Hay más de una unidad compatible. Falta evidencia que permita diferenciarlas.",
    };
  }

  const positivas = families.filter((f) => f.nature === "POSITIVE");
  const independentFamiliesConverging = positivas.map((f) => f.family);

  // 3) Dos o más familias con peso propio convergiendo (nunca PADRON ni
  // OBLIGATION: no son parámetros de esta función — ya fueron usadas DENTRO
  // de cada motor como contexto de validación, nunca vuelven a sumar acá).
  if (positivas.length >= 2) {
    const parcial = importeBancarioNoExacto(bank);
    return {
      state: parcial ? "PRE_CONCILIABLE" : "RECONCILIATION_CONFIRMED",
      families,
      independentFamiliesConverging,
      hasContradiction: false,
      contradictionDetail: null,
      explanation: parcial
        ? "Evidencia convergente de más de una familia, pero el importe bancario no es exacto (parcial/excedente) — no se confirma la conciliación por monto solo."
        : "Evidencia convergente e independiente de más de una familia, sin contradicciones — lista para decisión humana de conciliación.",
    };
  }

  // 4) Exactamente una familia positiva.
  if (positivas.length === 1) {
    const unica = positivas[0];
    if (unica.family === "BANK_MOVEMENT") {
      return {
        state: "PRE_CONCILIABLE",
        families,
        independentFamiliesConverging,
        hasContradiction: false,
        contradictionDetail: null,
        explanation: "Movimiento bancario identificado y validado contra padrón/obligación, todavía sin una segunda familia independiente que lo corrobore.",
      };
    }
    // unica.family === "WHATSAPP_MESSAGE"
    if (familiaBanco.present) {
      // Hay actividad bancaria real que no confirmó este candidato (BLOCKED
      // no-contradictorio) — no es solo "esperar", requiere revisión.
      return {
        state: "NEEDS_DECISION",
        families,
        independentFamiliesConverging,
        hasContradiction: false,
        contradictionDetail: null,
        explanation: "Hay evidencia de WhatsApp y movimiento bancario, pero el banco no confirmó el mismo candidato — requiere revisión.",
      };
    }
    return {
      state: "INFORMATIONAL",
      families,
      independentFamiliesConverging,
      hasContradiction: false,
      contradictionDetail: null,
      explanation: "Comprobante de WhatsApp con candidato identificado, esperando confirmación bancaria (WAITING_BANK_CONFIRMATION) — todavía no hay ningún movimiento bancario.",
    };
  }

  // 5) Ninguna familia positiva.
  if (!familiaBanco.present && !familiaWhatsapp.present) {
    return {
      state: "NEEDS_DATA",
      families,
      independentFamiliesConverging: [],
      hasContradiction: false,
      contradictionDetail: null,
      explanation: "No hay ninguna evidencia disponible todavía.",
    };
  }

  return {
    state: "NEEDS_DATA",
    families,
    independentFamiliesConverging: [],
    hasContradiction: false,
    contradictionDetail: null,
    explanation: "La evidencia disponible no alcanza para proponer ningún candidato.",
  };
}
