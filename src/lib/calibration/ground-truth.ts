// Fase 5.10 — vinculación entre evaluaciones del motor (PaymentEvidenceAssessmentLog)
// y decisiones humanas (ReconciliationMatch). Función PURA — recibe arrays ya
// leídos, nunca toca Prisma. Regla de oro, pedida explícitamente: "es
// preferible tener menos casos confiables que contaminar el dataset" — ante
// cualquier ambigüedad, UNRESOLVED, nunca una relación inventada.
//
// Fase 5.13 — cierre del loop selección-multicandidato→calibración: una
// evaluación AMBIGUA (`candidateUnitId=null`) no propone UN candidato, pero
// SÍ propone un CONJUNTO real de candidatos (`topCandidates`, ya calculado
// por el motor real — ver review-queue.ts). Una decisión humana sobre
// cualquiera de esos candidatos reales es tan causalmente trazable a esta
// evaluación como lo es, en el camino normal, una decisión sobre el único
// `candidateUnitId`. Se generaliza el algoritmo para operar sobre un
// CONJUNTO de candidatos (`[candidateUnitId]` en el caso normal,
// `candidatosPosiblesUnitIds` en el caso ambiguo) — NUNCA se inventa
// `candidateUnitId`, NUNCA se muta la evaluación original: el conjunto es un
// dato adicional, calculado en `loader.ts` a partir de `topCandidates` ya
// real, nunca un texto ni una heurística.
import type { GroundTruthLabel } from "./types";

export interface EvaluacionCruda {
  id: string;
  paymentTransactionId: string;
  candidateUnitId: string | null;
  /**
   * Fase 5.13 — SOLO para evaluaciones ambiguas (`candidateUnitId=null`):
   * los `Unit.id` REALES que esta evaluación propuso como candidatos
   * (resueltos desde `structuredEvidence.bank.topCandidates.unitCode` por
   * `loader.ts`, contra la organización real del pago — nunca inventados).
   * `undefined`/`null`/`[]` → mismo comportamiento que antes de Fase 5.13
   * (UNRESOLVED si no hay candidateUnitId), retrocompatible.
   */
  candidatosPosiblesUnitIds?: string[] | null;
  evaluatedAt: string; // ISO
}

export interface DecisionCruda {
  id: string;
  paymentTransactionId: string;
  unitId: string | null;
  decision: string; // ReconciliationDecision completo — se filtra a APPROVED/REJECTED acá adentro
  createdAt: string; // ISO
}

export interface ResultadoVinculacion {
  groundTruth: GroundTruthLabel;
  humanDecision: "APPROVED" | "REJECTED" | null;
  humanDecidedAt: string | null;
  humanDecisionSourceId: string | null;
  /**
   * Fase 5.13 — SOLO no-null cuando `groundTruth==="HUMAN_CONFIRMED"`: el
   * `Unit.id` real que terminó confirmado. Para el camino normal (candidato
   * único) es siempre igual a `evaluacion.candidateUnitId` — redundante a
   * propósito, nunca lo reemplaza. Para el camino ambiguo es el ÚNICO lugar
   * que expone cuál de los `candidatosPosiblesUnitIds` reales fue el elegido
   * — `candidateUnitId` de la evaluación se mantiene `null`, tal como el
   * motor real lo calculó, siempre.
   */
  humanConfirmedUnitId: string | null;
}

const RESULTADO_INSUFFICIENT_DATA: ResultadoVinculacion = { groundTruth: "INSUFFICIENT_DATA", humanDecision: null, humanDecidedAt: null, humanDecisionSourceId: null, humanConfirmedUnitId: null };
const RESULTADO_UNRESOLVED: ResultadoVinculacion = { groundTruth: "UNRESOLVED", humanDecision: null, humanDecidedAt: null, humanDecisionSourceId: null, humanConfirmedUnitId: null };

/**
 * Decisiones humanas reales — únicamente APPROVED/REJECTED. AUTO/SUGGESTED/
 * EXCEPTION nunca son "ground truth humano": AUTO no existe hoy en ningún
 * camino real (motor de unidad); SUGGESTED/EXCEPTION no son una decisión
 * tomada, son estados intermedios de otro flujo (no construido).
 */
function esDecisionHumanaReal(d: DecisionCruda): d is DecisionCruda & { decision: "APPROVED" | "REJECTED" } {
  return d.decision === "APPROVED" || d.decision === "REJECTED";
}

/**
 * Fase 5.13 — el conjunto de unidades REALES que esta evaluación propuso:
 * `[candidateUnitId]` en el caso normal (candidato único), o
 * `candidatosPosiblesUnitIds` en el caso ambiguo (candidateUnitId=null).
 * Nunca inventa nada — si no hay ninguno de los dos, el conjunto es vacío,
 * mismo comportamiento que antes de esta fase.
 */
function candidatosDeEstaEvaluacion(evaluacion: EvaluacionCruda): string[] {
  if (evaluacion.candidateUnitId) return [evaluacion.candidateUnitId];
  return evaluacion.candidatosPosiblesUnitIds ?? [];
}

/**
 * Para UNA evaluación puntual, determina su ground truth mirando TODAS las
 * decisiones humanas reales de ese mismo pago. Vincula solo si:
 * 1) la decisión tiene `unitId` no nulo,
 * 2) ese `unitId` está entre los candidatos REALES que esta evaluación
 *    propuso (`candidatosDeEstaEvaluacion` — un único valor en el camino
 *    normal, varios en el camino ambiguo, Fase 5.13),
 * 3) la evaluación es la MÁS RECIENTE, entre las que también proponían esa
 *    MISMA unidad puntual, con `evaluatedAt <= decision.createdAt`
 *    (causalidad: la evidencia tiene que haber existido antes o al momento
 *    de la decisión — nunca después).
 * Si hay más de una decisión candidata que cumple, se toma la más cercana
 * en el tiempo a la evaluación (la más "inmediata"). Cualquier otro caso →
 * UNRESOLVED (si hay decisiones para el pago) o INSUFFICIENT_DATA (si no
 * hay ninguna).
 */
export function vincularEvaluacionConDecision(
  evaluacion: EvaluacionCruda,
  todasLasEvaluacionesDelPago: EvaluacionCruda[],
  todasLasDecisionesDelPago: DecisionCruda[]
): ResultadoVinculacion {
  const decisionesReales = todasLasDecisionesDelPago.filter(esDecisionHumanaReal);

  if (decisionesReales.length === 0) return RESULTADO_INSUFFICIENT_DATA;

  const candidatos = candidatosDeEstaEvaluacion(evaluacion);
  if (candidatos.length === 0) {
    // Esta evaluación puntual no propuso ninguna unidad (ni única ni un
    // conjunto ambiguo) — no hay nada que una decisión pueda estar
    // confirmando/rechazando EN ESTA evaluación, aunque el pago sí tenga
    // decisiones (probablemente vinculadas a otra evaluación, o no
    // vinculables en absoluto).
    return RESULTADO_UNRESOLVED;
  }
  const candidatosSet = new Set(candidatos);

  // Decisiones cuyo unitId es alguno de los que ESTA evaluación propuso.
  const decisionesCompatibles = decisionesReales.filter((d) => d.unitId !== null && candidatosSet.has(d.unitId));
  if (decisionesCompatibles.length === 0) return RESULTADO_UNRESOLVED;

  for (const decision of decisionesCompatibles.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    // ¿Es ESTA evaluación la más reciente, entre TODAS las que también
    // proponían la MISMA unidad puntual de esta decisión (`decision.unitId`),
    // anterior o igual a la decisión? Si una evaluación MÁS NUEVA que
    // también proponía esa unidad existe y también es anterior a la
    // decisión, esa (no esta) es "la" evaluación vinculada — evita vincular
    // una decisión a evidencia ya superada. Generaliza `evaluacionesMismaUnidad`
    // (Fase 5.10) a cualquier evaluación cuyo CONJUNTO de candidatos incluya
    // esta unidad puntual, no solo las de candidato único.
    const evaluacionesConEstaUnidad = todasLasEvaluacionesDelPago.filter((e) => candidatosDeEstaEvaluacion(e).includes(decision.unitId as string));
    const elegibles = evaluacionesConEstaUnidad.filter((e) => e.evaluatedAt <= decision.createdAt);
    if (elegibles.length === 0) continue; // la decisión es anterior a cualquier evidencia con esa unidad — no vinculable a nada
    const masReciente = elegibles.reduce((acc, e) => (e.evaluatedAt > acc.evaluatedAt ? e : acc));
    if (masReciente.id === evaluacion.id) {
      return {
        groundTruth: decision.decision === "APPROVED" ? "HUMAN_CONFIRMED" : "HUMAN_REJECTED",
        humanDecision: decision.decision,
        humanDecidedAt: decision.createdAt,
        humanDecisionSourceId: decision.id,
        humanConfirmedUnitId: decision.decision === "APPROVED" ? decision.unitId : null,
      };
    }
  }

  // Había decisiones sobre alguna unidad que esta evaluación propuso, pero
  // ESTA evaluación puntual no es la que corresponde vincular (fue superada
  // por otra evaluación más reciente antes de la decisión, o la decisión es
  // anterior a esta evaluación) — no se fuerza nada.
  return RESULTADO_UNRESOLVED;
}
