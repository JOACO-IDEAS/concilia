// Fase 5.12 — capa PURA que decide qué evaluaciones de evidence-score.ts son
// "revisables" por un administrador real, y da forma a lo que la UI necesita
// mostrar. Nunca toca Prisma (eso vive en human-review-actions.ts, el único
// archivo de esta fase que lee/escribe). Nunca decide nada — solo filtra y
// formatea lo que el motor real ya calculó.
//
// Alcance deliberado (ver diagnóstico previo, Regla 0 del pedido): un caso
// es revisable solo si tiene un candidateUnitId único (una "sugerencia"
// puntual) — PRE_CONCILIABLE, RECONCILIATION_CONFIRMED, o NEEDS_DECISION por
// CONTRADICCIÓN (que sí tiene un candidato puntual contestado). NEEDS_DATA/
// INFORMATIONAL tampoco son revisables — no hay suficiente evidencia
// todavía para pedirle criterio a un humano.
//
// Fase 5.13 — NEEDS_DECISION por AMBIGÜEDAD (múltiples candidatos, sin
// ganador claro — `candidateUnitId` null a propósito, ver
// evidence-score.ts::evaluarFamiliaBankMovement) ahora SÍ es revisable, por
// un camino separado (`CasoAmbiguo`, nunca mezclado con `CasoRevisable`): el
// dato de los candidatos reales ya existía, sin usar, en
// `structuredEvidence.bank.topCandidates` (match-engine.ts::construirTopCandidates,
// poblado siempre desde `resultado.candidates`, sin condicionar por
// `status` — confirmado por lectura directa, no un campo nuevo).

import type { EvidenceFamilyResult, PaymentEvidenceState } from "@/lib/payment-evidence/evidence-score";
import type { StructuredEvidenceSnapshot } from "@/lib/payment-evidence/evidence-score-store";
import type { Tier, TopCandidateDiagnostico } from "./types";

export type EstadoRevisable = "PRE_CONCILIABLE" | "RECONCILIATION_CONFIRMED" | "NEEDS_DECISION";

const ESTADOS_REVISABLES: ReadonlySet<PaymentEvidenceState> = new Set(["PRE_CONCILIABLE", "RECONCILIATION_CONFIRMED", "NEEDS_DECISION"]);

export interface EvaluacionCruda {
  id: string;
  paymentTransactionId: string;
  state: PaymentEvidenceState;
  candidateUnitId: string | null;
  families: EvidenceFamilyResult[];
  hasContradiction: boolean;
  contradictionDetail: string | null;
  explanation: string;
  structuredEvidence: StructuredEvidenceSnapshot | null;
  evaluatedAt: string; // ISO
}

export interface DecisionCruda {
  paymentTransactionId: string;
  unitId: string | null;
  decision: string;
}

export interface CasoRevisable {
  paymentTransactionId: string;
  candidateUnitId: string;
  state: EstadoRevisable;
  score: number | null;
  tier: Tier | null;
  hasContradiction: boolean;
  contradictionDetail: string | null;
  explanation: string;
  structuredEvidence: StructuredEvidenceSnapshot | null;
  evaluatedAt: string;
}

function esEstadoRevisable(state: PaymentEvidenceState): state is EstadoRevisable {
  return ESTADOS_REVISABLES.has(state);
}

/** Score/tier del candidato puntual — busca la familia que apunta a `candidateUnitId`, sin importar su `nature` (POSITIVE o CONTRADICTORY, ambos revisables). Nunca inventa un score. */
function scoreYTierDeCandidato(families: EvidenceFamilyResult[], candidateUnitId: string): { score: number | null; tier: Tier | null } {
  const familia = families.find((f) => f.unitId === candidateUnitId);
  return { score: familia?.score ?? null, tier: familia?.tier ?? null };
}

/**
 * `true` si YA existe una decisión humana real (APPROVED o REJECTED) para
 * este pago+unidad puntual — un caso ya decidido nunca vuelve a aparecer en
 * la cola. AUTO/SUGGESTED/EXCEPTION no cuentan como decisión (mismo criterio
 * que ground-truth.ts, Fase 5.10).
 */
function yaDecidido(paymentTransactionId: string, candidateUnitId: string, decisionesDelPago: DecisionCruda[]): boolean {
  return decisionesDelPago.some(
    (d) => d.paymentTransactionId === paymentTransactionId && d.unitId === candidateUnitId && (d.decision === "APPROVED" || d.decision === "REJECTED")
  );
}

export function esRevisable(evaluacion: EvaluacionCruda, decisionesDelPago: DecisionCruda[]): boolean {
  if (!evaluacion.candidateUnitId) return false;
  if (!esEstadoRevisable(evaluacion.state)) return false;
  return !yaDecidido(evaluacion.paymentTransactionId, evaluacion.candidateUnitId, decisionesDelPago);
}

function construirCasoRevisable(evaluacion: EvaluacionCruda): CasoRevisable {
  const candidateUnitId = evaluacion.candidateUnitId as string;
  const { score, tier } = scoreYTierDeCandidato(evaluacion.families, candidateUnitId);
  return {
    paymentTransactionId: evaluacion.paymentTransactionId,
    candidateUnitId,
    state: evaluacion.state as EstadoRevisable,
    score,
    tier,
    hasContradiction: evaluacion.hasContradiction,
    contradictionDetail: evaluacion.contradictionDetail,
    explanation: evaluacion.explanation,
    structuredEvidence: evaluacion.structuredEvidence,
    evaluatedAt: evaluacion.evaluatedAt,
  };
}

/** Compartido entre `filtrarCasosRevisables` y `filtrarCasosAmbiguos` — UNA evaluación por pago, la más reciente (mismo criterio de "vigencia" que el resto del sistema). */
function masRecienteEvaluacionPorPago(evaluaciones: EvaluacionCruda[]): EvaluacionCruda[] {
  const masReciente = new Map<string, EvaluacionCruda>();
  for (const e of evaluaciones) {
    const actual = masReciente.get(e.paymentTransactionId);
    if (!actual || e.evaluatedAt > actual.evaluatedAt) masReciente.set(e.paymentTransactionId, e);
  }
  return [...masReciente.values()];
}

function agruparDecisionesPorPago(decisiones: DecisionCruda[]): Map<string, DecisionCruda[]> {
  const decisionesPorPago = new Map<string, DecisionCruda[]>();
  for (const d of decisiones) {
    const arr = decisionesPorPago.get(d.paymentTransactionId) ?? [];
    arr.push(d);
    decisionesPorPago.set(d.paymentTransactionId, arr);
  }
  return decisionesPorPago;
}

/**
 * Filtra y arma la cola de revisión — UNA fila por pago (la evaluación más
 * reciente, mismo criterio de "vigencia" que el resto del sistema), solo
 * las que son revisables y no fueron ya decididas. Orden: más reciente
 * primero.
 */
export function filtrarCasosRevisables(evaluaciones: EvaluacionCruda[], decisiones: DecisionCruda[]): CasoRevisable[] {
  const decisionesPorPago = agruparDecisionesPorPago(decisiones);

  const resultado: CasoRevisable[] = [];
  for (const evaluacion of masRecienteEvaluacionPorPago(evaluaciones)) {
    const decisionesDelPago = decisionesPorPago.get(evaluacion.paymentTransactionId) ?? [];
    if (esRevisable(evaluacion, decisionesDelPago)) resultado.push(construirCasoRevisable(evaluacion));
  }

  return resultado.sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt));
}

// --- Fase 5.13 — casos AMBIGUOUS (selector multi-candidato) ---

export interface CasoAmbiguo {
  paymentTransactionId: string;
  /** Candidatos REALES (unitCode/score/tier/matchedSignals) — directo de `structuredEvidence.bank.topCandidates`, nunca inventados. Siempre >= 2 (si hubiera 1 solo, no habría ambigüedad). */
  candidatos: TopCandidateDiagnostico[];
  explanation: string;
  structuredEvidence: StructuredEvidenceSnapshot | null;
  evaluatedAt: string;
}

/**
 * `true` solo para el caso estructural real de ambigüedad: sin candidato
 * único (`candidateUnitId` null), estado `NEEDS_DECISION`, SIN contradicción
 * (eso es el otro camino, `CasoRevisable`), y con al menos 2 candidatos
 * reales en `topCandidates` — si hubiera menos de 2, no hay entre qué elegir
 * y no se fuerza a mostrar nada.
 */
function esCasoAmbiguo(evaluacion: EvaluacionCruda): boolean {
  if (evaluacion.candidateUnitId) return false;
  if (evaluacion.state !== "NEEDS_DECISION") return false;
  if (evaluacion.hasContradiction) return false;
  const candidatos = evaluacion.structuredEvidence?.bank?.topCandidates;
  return Array.isArray(candidatos) && candidatos.length >= 2;
}

/**
 * A diferencia de `esRevisable` (que exige exactamente ESA unidad sin
 * decidir), acá cualquier decisión real ya tomada sobre CUALQUIER unidad de
 * este pago cierra el caso — las únicas 2 acciones posibles desde la UI son
 * "elegir un candidato" (1 APPROVED) o "rechazar todos" (1 REJECTED por
 * candidato, escritos juntos) — nunca queda un estado intermedio parcial.
 */
function yaDecididoAmbiguo(paymentTransactionId: string, decisionesDelPago: DecisionCruda[]): boolean {
  return decisionesDelPago.some((d) => d.paymentTransactionId === paymentTransactionId && (d.decision === "APPROVED" || d.decision === "REJECTED"));
}

function construirCasoAmbiguo(evaluacion: EvaluacionCruda): CasoAmbiguo {
  return {
    paymentTransactionId: evaluacion.paymentTransactionId,
    candidatos: evaluacion.structuredEvidence?.bank?.topCandidates ?? [],
    explanation: evaluacion.explanation,
    structuredEvidence: evaluacion.structuredEvidence,
    evaluatedAt: evaluacion.evaluatedAt,
  };
}

/** Mismo criterio de vigencia/orden que `filtrarCasosRevisables` — camino separado, nunca se mezclan los dos tipos de caso. */
export function filtrarCasosAmbiguos(evaluaciones: EvaluacionCruda[], decisiones: DecisionCruda[]): CasoAmbiguo[] {
  const decisionesPorPago = agruparDecisionesPorPago(decisiones);

  const resultado: CasoAmbiguo[] = [];
  for (const evaluacion of masRecienteEvaluacionPorPago(evaluaciones)) {
    const decisionesDelPago = decisionesPorPago.get(evaluacion.paymentTransactionId) ?? [];
    if (esCasoAmbiguo(evaluacion) && !yaDecididoAmbiguo(evaluacion.paymentTransactionId, decisionesDelPago)) {
      resultado.push(construirCasoAmbiguo(evaluacion));
    }
  }

  return resultado.sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt));
}
