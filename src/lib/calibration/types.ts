// Fase 5.10 — tipos del dataset de calibración supervisada. Capa PURA de
// lectura/análisis sobre datos que ya existen (ReconciliationMatch,
// PaymentEvidenceAssessmentLog) — nunca escribe, nunca decide, nunca
// habilita AUTO. Ver FASE_5_10_CALIBRACION_SUPERVISADA_FINAL.md para el
// diseño completo.

import type { EvidenceFamilyName, EvidenceFamilyResult, PaymentEvidenceState } from "@/lib/payment-evidence/evidence-score";
import type { StructuredEvidenceSnapshot } from "@/lib/payment-evidence/evidence-score-store";
import type { Tier } from "@/lib/reconciliation/types";
import type { DecisionProvenance } from "./decision-provenance";

/**
 * MOTOR = "qué recomendó ConcilIA" (PaymentEvidenceAssessmentLog).
 * HUMANO = "qué decidió finalmente el administrador" (ReconciliationMatch,
 * decision=APPROVED|REJECTED — nunca AUTO/SUGGESTED/EXCEPTION, esos no son
 * decisiones humanas confirmadas).
 *
 * - HUMAN_CONFIRMED: hay una ReconciliationMatch(APPROVED) cuyo `unitId`
 *   coincide EXACTAMENTE con el `candidateUnitId` de una evaluación real del
 *   mismo pago — la decisión humana confirma inequívocamente qué evaluación
 *   del motor está aprobando.
 * - HUMAN_REJECTED: mismo criterio, con ReconciliationMatch(REJECTED).
 * - INSUFFICIENT_DATA: existe evaluación del motor, pero NINGUNA
 *   ReconciliationMatch para ese pago — todavía no hay decisión humana.
 * - UNRESOLVED: existen evaluación(es) Y decisión(es) para el mismo pago,
 *   pero NO se pueden vincular sin ambigüedad (candidateUnitId nulo, no
 *   coincide con ninguna evaluación, o hay más de una evaluación con
 *   distinto candidateUnitId sin forma de saber cuál motivó la decisión).
 *   NUNCA se fuerza a CONFIRMED/REJECTED por descarte.
 */
export type GroundTruthLabel = "HUMAN_CONFIRMED" | "HUMAN_REJECTED" | "UNRESOLVED" | "INSUFFICIENT_DATA";

/** Si el dato viene de fixtures reales (payment/organization/unit reales) o fue construido a mano para probar un escenario que no existe naturalmente todavía. Nunca se mezclan sin marcar. */
export type CaseOrigin = "REAL" | "SYNTHETIC";

/**
 * Fase 5.11 — eje DISTINTO de `CaseOrigin`: `origin` responde "¿el pago/
 * evaluación es un dato real o fabricado para un test?"; `DecisionProvenance`
 * responde "¿la DECISIÓN HUMANA la tomó un administrador real, o fue
 * fabricada para demostrar la infraestructura (Fase 5.10)?". Ver
 * decision-provenance.ts y FASE_5_11_AUDITORIA_DE_DISENO.md (Hallazgo 1) —
 * un caso puede perfectamente tener origin="REAL" (pago/evaluación reales) y
 * humanDecisionProvenance="SYNTHETIC_DEMO" (decisión fabricada), como los 2
 * casos de Fase 5.10 en dev-fixtures hoy. Nunca se presentan métricas
 * agregadas mezclando ORGANIC y SYNTHETIC_DEMO sin distinguirlas.
 */
export type { DecisionProvenance };

export interface CalibrationCase {
  paymentTransactionId: string;
  candidateUnitId: string | null;

  /** Versión del motor bancario (MATCH_ENGINE_VERSION) — best-effort, leída de ShadowMatchLog al cargar el dataset; `null` si no se pudo determinar. */
  bankEngineVersion: string | null;
  /** Versión de evidence-score.ts (EVIDENCE_SCORE_VERSION) — siempre presente, viene de PaymentEvidenceAssessmentLog.engineVersion. */
  evidenceScoreVersion: string;

  engineState: PaymentEvidenceState;
  /** Score de la familia ganadora (la que aporta candidateUnitId) — `null` si no hay candidato. Nunca inventado: tomado directo de `families`. */
  engineScore: number | null;
  tier: Tier | null;
  families: EvidenceFamilyResult[];
  independentFamiliesConverging: EvidenceFamilyName[];
  structuredEvidence: StructuredEvidenceSnapshot | null;
  hasContradiction: boolean;
  contradictionDetail: string | null;
  explanation: string;
  evaluatedAt: string;

  groundTruth: GroundTruthLabel;
  humanDecision: "APPROVED" | "REJECTED" | null;
  humanDecidedAt: string | null;
  /** id de la ReconciliationMatch que sustenta este ground truth, para trazabilidad — null si no hay ninguna vinculada. */
  humanDecisionSourceId: string | null;
  /** Fase 5.11 — `null` cuando no hay ninguna decisión vinculada (UNRESOLVED/INSUFFICIENT_DATA); ver comentario de `DecisionProvenance` arriba. */
  humanDecisionProvenance: DecisionProvenance | null;
  /** Fase 5.11 — texto de `ReconciliationMatch.rejectionReason` de la decisión vinculada. `null` si no hay decisión vinculada o si la decisión fue APPROVED (rejectionReason solo aplica a REJECTED, ver schema). Usado por automation-candidates.ts para agrupar "mismo motivo de rechazo repetido". */
  humanRejectionReason: string | null;
  /**
   * Fase 5.13 — SOLO no-null cuando `groundTruth==="HUMAN_CONFIRMED"`: el
   * `Unit.id` real que terminó confirmado. Para candidato único, siempre
   * igual a `candidateUnitId` (redundante a propósito). Para un caso
   * AMBIGUO (`candidateUnitId=null`), es el ÚNICO campo que expone cuál de
   * los candidatos reales propuestos por el motor fue el elegido —
   * `candidateUnitId` nunca se toca, sigue reflejando exactamente lo que el
   * motor calculó. Ver ground-truth.ts::ResultadoVinculacion.
   */
  humanConfirmedUnitId: string | null;
  /**
   * Fase 5.14 — `Administrator.id` real que tomó la decisión vinculada
   * (`ReconciliationMatch.decidedBy`), o `null` si no hay decisión vinculada
   * o si es una decisión histórica anterior al sistema real de
   * autenticación (nunca inferido ni completado retroactivamente). Aún sin
   * consumidores de análisis — habilita en fases futuras, cuando exista
   * evidencia ORGANIC real, detectar por ejemplo si la confianza de un
   * patrón depende de un único administrador. No usado hoy por
   * recommendation.ts/pattern-mining.ts.
   */
  humanDecidedBy: string | null;
  /**
   * Fase 5.15 — `ReconciliationMatch.score` de la decisión vinculada:
   * reutilizado tal cual del candidato ya evaluado por el motor (nunca
   * recalculado, ver `human-decision.ts::registrarDecisionHumana`), no
   * necesariamente igual a `engineScore` — `engineScore` se deriva de
   * `families` de la evaluación vinculada y es `null` para toda evaluación
   * AMBIGUA (`candidateUnitId=null`), incluso si el caso terminó
   * `HUMAN_CONFIRMED`. `humanDecisionScore` sí captura ese score en ese
   * caso, porque viene de la decisión humana, no de `families`. `null` si
   * no hay decisión vinculada o si la decisión se registró sin score (ej.
   * vínculo manual sin scoring, ver comentario del propio schema). Sin
   * consumidores todavía — expuesto para análisis de fases futuras.
   */
  humanDecisionScore: number | null;

  origin: CaseOrigin;
}

/** Motor "positivo" a los fines de la matriz de confusión: propuso un candidato con evidencia suficiente para acercarse a conciliación — nunca RECONCILIATION_CONFIRMED automático, solo una etiqueta descriptiva. */
export function motorEsPositivo(estado: PaymentEvidenceState): boolean {
  return estado === "PRE_CONCILIABLE" || estado === "RECONCILIATION_CONFIRMED";
}

export type CategoriaConfusion = "TP" | "FP" | "FN" | "TN" | "NOT_CALIBRATABLE";

export type CausaDesacuerdo =
  | "false_positive_probable"
  | "false_negative_probable"
  | "missing_evidence"
  | "contradictory_evidence"
  | "ambiguous_identity"
  | "duplicate_candidate"
  | "obligation_missing"
  | "historical_context_missing"
  | "phone_ambiguity"
  | "insufficient_structured_data"
  | "unknown";
