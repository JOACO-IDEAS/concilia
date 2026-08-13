// Cálculo de señales — RECONCILIATION_MATCHING_ARCHITECTURE.md §5/§8. Cada
// señal produce un objeto estructurado con su propia evidencia legible —
// nunca se esconde detrás de un score global (pedido explícito de esta
// fase). Ver FASE_3_3_IMPLEMENTATION_PLAN.md §5 para qué señales son
// computables desde un PaymentTransaction real hoy y cuáles no.

import type { Prisma } from "@/generated/prisma/client";
import type { PhoneResolution, Signal } from "./types";
import { soloDigitos, tokenizarNombre } from "./text-utils";
import { canonicalizarCodigoUnidad, extraerCodigoUnidadDeTexto } from "./unit-code";
import { clasificarImporte, type ObligacionCandidata } from "./amount-policy";
import type { AmountAssessment } from "./types";

const VENTANA_FECHA_DIAS = 45;

/** CUIT del pagador (`payerIdentifier`) vs `UnitOwner.taxId` — Tier 1. */
export function calcularSenalCuit(payerIdentifier: string | null, taxId: string | null): Signal {
  if (!payerIdentifier || !taxId) {
    return {
      signal: "CUIT_EXACT",
      tier: 1,
      matched: false,
      strength: "NONE",
      evidence: "Sin CUIT disponible en el pago o en el titular para comparar.",
    };
  }
  const a = soloDigitos(payerIdentifier);
  const b = soloDigitos(taxId);
  const coincide = a.length > 0 && a === b;
  return {
    signal: "CUIT_EXACT",
    tier: 1,
    matched: coincide,
    strength: coincide ? "STRONG" : "NONE",
    evidence: coincide
      ? `CUIT ${taxId} coincide exactamente.`
      : `CUIT del pago (${payerIdentifier}) no coincide con el del titular (${taxId}).`,
  };
}

/**
 * Código de unidad extraído del concepto vs `Unit.code` de ESTA unidad —
 * Tier 1. La ambigüedad (matchea más de una unidad de la organización) se
 * detecta un nivel más arriba, en deterministic-matcher.ts, contando cuántas
 * unidades del universo devuelven `matched: true`.
 */
export function calcularSenalUnitCode(concept: string | null, unitCode: string): Signal {
  if (!concept) {
    return {
      signal: "UNIT_CODE_EXACT",
      tier: 1,
      matched: false,
      strength: "NONE",
      evidence: "El pago no tiene concepto del cual extraer un código de unidad.",
    };
  }
  const extraido = extraerCodigoUnidadDeTexto(concept);
  if (!extraido) {
    return {
      signal: "UNIT_CODE_EXACT",
      tier: 1,
      matched: false,
      strength: "NONE",
      evidence: "No se encontró ningún código de unidad reconocible en el concepto.",
    };
  }
  const coincide = canonicalizarCodigoUnidad(extraido) === canonicalizarCodigoUnidad(unitCode);
  return {
    signal: "UNIT_CODE_EXACT",
    tier: 1,
    matched: coincide,
    strength: coincide ? "STRONG" : "NONE",
    evidence: coincide
      ? `Código de unidad "${extraido}" del concepto coincide con UF ${unitCode}.`
      : `Código de unidad "${extraido}" del concepto no coincide con UF ${unitCode}.`,
  };
}

const TIER_POR_CATEGORIA_IMPORTE: Record<AmountAssessment["category"], 2 | 3 | 4> = {
  EXACTO: 2,
  COMPATIBLE_REDONDEO: 2,
  PARCIAL: 3,
  EXCEDENTE: 3,
  SUPERIOR_SIN_EXPLICAR: 4,
  AGRUPADO: 4,
  SIN_OBLIGACION: 4,
};

/** Importe vs obligaciones abiertas de la unidad — política de niveles ya aprobada. */
export function calcularSenalImporte(
  montoTransaccion: number,
  obligacionesAbiertas: ObligacionCandidata[]
): { signal: Signal; assessment: AmountAssessment } {
  const assessment = clasificarImporte(montoTransaccion, obligacionesAbiertas);
  const matched = assessment.category === "EXACTO" || assessment.category === "COMPATIBLE_REDONDEO" || assessment.category === "PARCIAL" || assessment.category === "EXCEDENTE";
  return {
    signal: {
      signal: "AMOUNT_MATCH",
      tier: TIER_POR_CATEGORIA_IMPORTE[assessment.category],
      matched,
      strength: matched ? (assessment.category === "EXACTO" || assessment.category === "COMPATIBLE_REDONDEO" ? "STRONG" : "MEDIUM") : "NONE",
      evidence: assessment.evidence,
    },
    assessment,
  };
}

/** Fecha real del movimiento vs vencimiento/período de la obligación — Tier 4, débil. */
export function calcularSenalFecha(
  transactionDate: Date | null,
  obligacion: { period: Date; dueDate: Date | null } | null
): Signal {
  if (!transactionDate || !obligacion) {
    return {
      signal: "DATE_COMPATIBLE",
      tier: 4,
      matched: false,
      strength: "NONE",
      evidence: !transactionDate
        ? "El pago no tiene fecha real del movimiento disponible."
        : "No hay obligación contra la cual comparar la fecha.",
    };
  }
  const referencia = obligacion.dueDate ?? obligacion.period;
  const diffDias = Math.abs((transactionDate.getTime() - referencia.getTime()) / (1000 * 60 * 60 * 24));
  const compatible = diffDias <= VENTANA_FECHA_DIAS;
  return {
    signal: "DATE_COMPATIBLE",
    tier: 4,
    matched: compatible,
    strength: compatible ? "WEAK" : "NONE",
    evidence: compatible
      ? `Fecha del movimiento dentro de una ventana plausible (${Math.round(diffDias)} días) respecto del vencimiento.`
      : `Fecha del movimiento fuera de la ventana plausible (${Math.round(diffDias)} días de diferencia).`,
  };
}

/** Referencia bancaria del pago vs `Obligation.externalRef` — Tier 1 cuando coincide. */
export function calcularSenalReferencia(
  referenceNumber: string | null,
  externalRef: string | null
): Signal {
  if (!referenceNumber || !externalRef) {
    return {
      signal: "REFERENCE_MATCH",
      tier: 1,
      matched: false,
      strength: "NONE",
      evidence: "Sin número de referencia disponible en el pago o en la obligación para comparar.",
    };
  }
  const coincide = referenceNumber.trim().toLowerCase() === externalRef.trim().toLowerCase();
  return {
    signal: "REFERENCE_MATCH",
    tier: 1,
    matched: coincide,
    strength: coincide ? "STRONG" : "NONE",
    evidence: coincide
      ? `Referencia bancaria "${referenceNumber}" coincide exactamente con la obligación.`
      : `Referencia bancaria "${referenceNumber}" no coincide con la de la obligación ("${externalRef}").`,
  };
}

/** Similitud de nombre entre el concepto del pago y el titular — Tier 4, débil, nunca decide sola. */
export function calcularSenalNombre(concept: string | null, fullName: string): Signal {
  if (!concept) {
    return {
      signal: "NAME_SIMILARITY",
      tier: 4,
      matched: false,
      strength: "NONE",
      evidence: "El pago no tiene concepto del cual comparar el nombre.",
    };
  }
  const tokensConcepto = new Set(tokenizarNombre(concept));
  const tokensNombre = tokenizarNombre(fullName);
  const coincidentes = tokensNombre.filter((t) => tokensConcepto.has(t));
  const matched = coincidentes.length > 0;
  return {
    signal: "NAME_SIMILARITY",
    tier: 4,
    matched,
    strength: matched ? "WEAK" : "NONE",
    evidence: matched
      ? `Nombre parcialmente compatible — coincide "${coincidentes.join(" ")}" en el concepto.`
      : `Ningún token del nombre del titular aparece en el concepto del pago.`,
  };
}

/** Email — misma limitación que el teléfono: PaymentTransaction no trae ninguno hoy (ver plan de implementación §5); función lista para un canal futuro que sí lo traiga. */
export function calcularSenalEmail(emailPago: string | null, emailTitular: string | null): Signal {
  if (!emailPago || !emailTitular) {
    return {
      signal: "EMAIL_MATCH",
      tier: 3,
      matched: false,
      strength: "NONE",
      evidence: "Sin email disponible para comparar (no aplica a un pago bancario sin este dato).",
    };
  }
  const coincide = emailPago.trim().toLowerCase() === emailTitular.trim().toLowerCase();
  return {
    signal: "EMAIL_MATCH",
    tier: 3,
    matched: coincide,
    strength: coincide ? "MEDIUM" : "NONE",
    evidence: coincide ? `Email ${emailTitular} coincide.` : `Email del pago no coincide con el del titular.`,
  };
}

/**
 * Patrón histórico: mismo importe en un PaymentTransaction ya MATCHED con
 * unitId resuelto a esta unidad — mismo criterio que smart-match.ts a nivel
 * organización, un nivel más abajo. Async porque requiere consulta —
 * hoy siempre `matched:false` en la práctica (unitId nunca se resolvió
 * todavía en ningún PaymentTransaction real), la lógica queda lista para
 * cuando eso cambie.
 */
export async function calcularSenalHistorialPagos(
  tx: Prisma.TransactionClient,
  unitId: string,
  monto: number,
  excluirPaymentTransactionId: string
): Promise<Signal> {
  const previo = await tx.paymentTransaction.findFirst({
    where: {
      unitId,
      status: "MATCHED",
      amount: monto,
      id: { not: excluirPaymentTransactionId },
    },
    select: { id: true },
  });
  return construirSenalHistorialPagos(previo !== null, monto);
}

/** Construye la misma señal a partir de una presencia histórica ya consultada.
 * Permite que el matcher resuelva varias unidades con una lectura batch,
 * sin modificar la semántica de la señal. */
export function construirSenalHistorialPagos(matched: boolean, monto: number): Signal {
  return {
    signal: "PAYMENT_HISTORY",
    tier: 3,
    matched,
    strength: matched ? "MEDIUM" : "NONE",
    evidence: matched
      ? `Mismo importe ($${monto}) que un pago ya conciliado anteriormente de esta unidad.`
      : "Sin historial de pagos anteriores con este mismo importe para esta unidad.",
  };
}

/**
 * Teléfono para EL titular puntual que se está evaluando — a partir de una
 * `PhoneResolution` ya calculada (ver phone-identity.ts) y de si ese
 * teléfono tiene confirmaciones históricas recientes
 * (`ReconciliationMatch` AUTO/APPROVED). Nunca ancla solo: CASO
 * SINGLE_CANDIDATE + confirmado por historial → Tier 2 (recién ahí puede
 * combinarse con otra señal Tier 2 independiente para calificar a AUTO en
 * una fase futura); SINGLE_CANDIDATE sin confirmar → Tier 3. Cualquier otro
 * caso (ambiguo, compartido, desconocido) nunca sube de Tier 3 y nunca
 * decide solo — ver FASE_3_1_PREPARACION_DE_DATOS.md §6.2/§6.5.
 */
export function calcularSenalTelefono(
  resolucion: PhoneResolution,
  unitOwnerId: string | null,
  confirmadoPorHistorial: boolean
): Signal {
  if (resolucion.case !== "SINGLE_CANDIDATE") {
    return {
      signal: "PHONE_MATCH",
      tier: 3,
      matched: false,
      strength: "NONE",
      evidence: resolucion.evidence,
    };
  }

  const candidato = resolucion.candidates[0];
  if (!unitOwnerId || candidato.unitOwnerId !== unitOwnerId) {
    return {
      signal: "PHONE_MATCH",
      tier: 3,
      matched: false,
      strength: "NONE",
      evidence: "El teléfono resuelto no corresponde a este titular.",
    };
  }

  if (confirmadoPorHistorial) {
    return {
      signal: "PHONE_MATCH",
      tier: 2,
      matched: true,
      strength: "STRONG",
      evidence: "Teléfono coincide y fue confirmado por pagos anteriores conciliados.",
    };
  }

  return {
    signal: "PHONE_MATCH",
    tier: 3,
    matched: true,
    strength: "MEDIUM",
    evidence: "Teléfono coincide, pero es la primera vez que se ve (sin historial de confirmación).",
  };
}
