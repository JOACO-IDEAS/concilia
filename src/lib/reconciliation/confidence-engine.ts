// Motor de confianza — RECONCILIATION_MATCHING_ARCHITECTURE.md §8. Combina
// evidencia (Signal[]) en un score + tier, por tiers, NUNCA una suma
// arbitraria de 9 señales sueltas. `wouldQualifyForAuto` es puramente
// informativo — ver types.ts: `CandidateStatus` no tiene ningún valor
// "AUTO", así que este booleano no puede disparar nada aunque quisiera.

import type { Signal, SignalName, Tier } from "./types";

// Puntaje por tier — ilustrativo, mismo criterio aditivo-capado-en-99 que ya
// usa smart-match.ts, coherente con el orden relativo del ejemplo del
// pedido (CUIT > teléfono confirmado > unidad/importe > historial > nombre).
// Vive como constante de código — ajustable sin migración, a calibrar en
// modo sombra (RECONCILIATION_MATCHING_ARCHITECTURE.md §11).
const PUNTOS_POR_TIER: Record<Tier, number> = { 1: 40, 2: 22, 3: 12, 4: 5 };

// Agrupa señales por la fuente de dato de la que realmente dependen — dos
// señales de la MISMA fuente no cuentan como independientes (regla ya
// aprobada, RECONCILIATION_MATCHING_ARCHITECTURE.md §8.2: "la misma
// evidencia leída dos veces" no debe sumar dos veces a la hora de decidir
// si algo calificaría para AUTO).
const FUENTE: Record<SignalName, string> = {
  CUIT_EXACT: "payerIdentifier",
  UNIT_CODE_EXACT: "concept",
  AMOUNT_MATCH: "amount",
  DATE_COMPATIBLE: "transactionDate",
  REFERENCE_MATCH: "referenceNumber",
  PHONE_MATCH: "phone",
  EMAIL_MATCH: "email",
  NAME_SIMILARITY: "concept",
  PAYMENT_HISTORY: "history",
};

export interface ConfidenceResult {
  tier: Tier | null; // tier más fuerte entre las señales que matchearon
  score: number; // 0-99
  wouldQualifyForAuto: boolean; // informativo — nunca dispara nada, ver arriba
}

export function calcularConfianza(signals: Signal[]): ConfidenceResult {
  const matcheadas = signals.filter((s) => s.matched);

  if (matcheadas.length === 0) {
    return { tier: null, score: 0, wouldQualifyForAuto: false };
  }

  const tierMasFuerte = matcheadas.reduce<Tier>((min, s) => (s.tier < min ? s.tier : min), 4);

  const score = Math.min(
    99,
    matcheadas.reduce((suma, s) => suma + PUNTOS_POR_TIER[s.tier], 0)
  );

  // AUTO exige, como mínimo: una señal Tier 1, o dos señales Tier 2 de
  // fuentes independientes. Nunca una pila de Tier 3/4, por alto que sume.
  const hayTier1 = matcheadas.some((s) => s.tier === 1);
  const fuentesTier2 = new Set(matcheadas.filter((s) => s.tier === 2).map((s) => FUENTE[s.signal]));
  const dosTier2Independientes = fuentesTier2.size >= 2;

  return {
    tier: tierMasFuerte,
    score,
    wouldQualifyForAuto: hayTier1 || dosTier2Independientes,
  };
}
