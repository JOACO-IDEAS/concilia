// Tipos del motor de matching — Fase 3.3, exclusivamente modo sombra (ver
// FASE_3_3_IMPLEMENTATION_PLAN.md). Ningún tipo de acá representa una
// decisión ejecutable: no existe un status "AUTO" en `CandidateStatus` — ver
// confidence-engine.ts para por qué eso es una garantía estructural, no una
// bandera que se pueda prender por error.

export type SignalName =
  | "CUIT_EXACT"
  | "UNIT_CODE_EXACT"
  | "AMOUNT_MATCH"
  | "DATE_COMPATIBLE"
  | "REFERENCE_MATCH"
  | "PHONE_MATCH"
  | "EMAIL_MATCH"
  | "NAME_SIMILARITY"
  | "PAYMENT_HISTORY";

// Tier de la señal — jerarquía relativa ya definida en
// RECONCILIATION_MATCHING_ARCHITECTURE.md §8.2 (1 = fuerte/casi-determinístico,
// 4 = débil, nunca decide solo).
export type Tier = 1 | 2 | 3 | 4;

export type Strength = "STRONG" | "MEDIUM" | "WEAK" | "NONE";

export interface Signal {
  signal: SignalName;
  tier: Tier;
  matched: boolean;
  strength: Strength;
  evidence: string;
}

// Categorías de importe — FASE_3_1_PREPARACION_DE_DATOS.md §4.1. Nunca se
// colapsan a un genérico "importe coincide".
export type AmountCategory =
  | "EXACTO"
  | "COMPATIBLE_REDONDEO"
  | "PARCIAL"
  | "EXCEDENTE"
  | "SUPERIOR_SIN_EXPLICAR"
  | "AGRUPADO"
  | "SIN_OBLIGACION";

export interface AmountAssessment {
  category: AmountCategory;
  obligationId: string | null;
  evidence: string;
}

// Los 4 casos del algoritmo de resolución de teléfono —
// FASE_3_1_PREPARACION_DE_DATOS.md §6.4.
export type PhoneCase = "UNKNOWN" | "SINGLE_CANDIDATE" | "AMBIGUOUS_WITHIN_ORG" | "AMBIGUOUS_ACROSS_ORGS";

export interface PhoneResolution {
  case: PhoneCase;
  candidates: { unitId: string; unitOwnerId: string; organizationId: string }[];
  evidence: string;
}

// Bloqueos duros — RECONCILIATION_MATCHING_ARCHITECTURE.md §9. Nunca
// compensables por score, sin importar cuánto sume.
export type BlockerType =
  | "IDENTITY_CONFLICT"
  | "PHONE_AMBIGUOUS"
  | "MULTIPLE_EQUIVALENT_CANDIDATES"
  | "AMOUNT_INCOMPATIBLE"
  | "UNIT_CODE_AMBIGUOUS"
  | "CUIT_CONTRADICTORY"
  | "PREVIOUSLY_REJECTED"
  | "DUPLICATE"
  | "NO_UNITS_IN_ORGANIZATION"
  | "INSUFFICIENT_EVIDENCE";

export interface Blocker {
  type: BlockerType;
  evidence: string;
}

// Resultado final — nunca incluye un status "AUTO" a propósito (ver §7 del
// plan de implementación).
export type CandidateStatus = "CANDIDATE" | "AMBIGUOUS" | "BLOCKED";

export interface CandidateEvaluation {
  unitId: string | null;
  unitOwnerId: string | null;
  obligationId: string | null;
  signals: Signal[];
  blockers: Blocker[];
  tier: Tier | null; // tier más fuerte alcanzado entre las señales que matchearon
  score: number; // 0-99, mismo rango que smart-match.ts/ReconciliationMatch.score
  wouldQualifyForAuto: boolean; // informativo únicamente — nunca dispara nada
}

export interface ShadowMatchResult {
  paymentTransactionId: string;
  candidateUnitId: string | null;
  candidateUnitOwnerId: string | null;
  candidateObligationId: string | null;
  score: number;
  tier: Tier | null;
  status: CandidateStatus;
  signals: Signal[];
  blockers: Blocker[];
  explanation: string;
  // Fase 3.4 — qué versión del algoritmo produjo este resultado (ver
  // version.ts). Identifica, junto con `paymentTransactionId`, una
  // evaluación única a los fines de idempotencia (shadow-store.ts).
  engineVersion: string;
  evaluatedAt: string; // ISO — momento del cálculo

  // Fase 3.9 — PURAMENTE DIAGNÓSTICO, para calibración (nunca para decidir
  // nada). `score`/`tier` de arriba siguen significando exactamente lo mismo
  // que antes: 0/null salvo que status="CANDIDATE". Estos dos campos, en
  // cambio, reflejan al MEJOR candidato que el motor encontró (candidates[0]
  // de deterministic-matcher.ts) SIN IMPORTAR el status final — así un
  // resultado BLOCKED con evidencia fuerte (ej. CUIT+código exactos, pero
  // importe sin explicar) no queda indistinguible de un BLOCKED sin ninguna
  // evidencia. `null` cuando no hubo ningún candidato para evaluar (ej.
  // NO_UNITS_IN_ORGANIZATION, o el pago sin organización resuelta) — distinto
  // de `0`, que significa "hubo candidatos, el mejor puntuó cero".
  //
  // Un score alto acá NUNCA implica elegibilidad: no crea ningún camino
  // hacia AUTO, no cambia `status`, no hace que `winner` deje de ser `null`
  // cuando corresponde. Sirve exclusivamente para poder preguntar, en modo
  // sombra, "¿cuántos BLOCKED tenían igual un candidato con score 90+?".
  topCandidateScore: number | null;
  topCandidateTier: Tier | null;

  // Fase 5.1 — generaliza los dos campos de arriba a hasta 3 candidatos,
  // con identidad real (`unitCode`, ya expuesto hoy para CANDIDATE — no es
  // un tipo de dato nuevo), para poder mostrar en un AMBIGUOUS "UF 1A —
  // score 72, UF 2B — score 69" en vez de solo un número. NUNCA incluye
  // `ownerFullName` (dato de persona) ni ningún candidato inventado — se
  // arma directamente desde `candidates` (ya calculado y ordenado por
  // deterministic-matcher.ts), tope 3, sin importar el `status` final.
  // `null` cuando `candidates` está vacío — mismo criterio que
  // `topCandidateScore=null`.
  topCandidates: TopCandidateDiagnostico[] | null;
}

export interface TopCandidateDiagnostico {
  unitCode: string;
  score: number;
  tier: Tier | null;
  matchedSignals: SignalName[];
}
