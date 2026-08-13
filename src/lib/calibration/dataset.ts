// Fase 5.10 — construcción del dataset de calibración. Función PURA: recibe
// evaluaciones y decisiones ya leídas (nunca Prisma acá adentro), arma un
// CalibrationCase por evaluación, vinculado a su ground truth. No inventa
// ninguna relación no soportada por los datos (ver ground-truth.ts).

import type { PaymentEvidenceAssessmentRecord } from "@/lib/payment-evidence/evidence-score-store";
import type { CalibrationCase, CaseOrigin } from "./types";
import { vincularEvaluacionConDecision, type DecisionCruda, type EvaluacionCruda } from "./ground-truth";
import { inferirProvenanceDeDecision } from "./decision-provenance";

export interface DecisionHumanaReal {
  id: string;
  paymentTransactionId: string;
  unitId: string | null;
  decision: string;
  createdAt: string; // ISO
  // Fase 5.11 — necesarios para inferirProvenanceDeDecision(); `reason` es
  // requerido en schema (nunca null en un dato real), `rejectionReason` solo
  // aplica a REJECTED. Opcionales acá para no romper callers/tests
  // preexistentes de Fase 5.10 que no los pasaban — ausentes se tratan igual
  // que cadena vacía (ORGANIC por default, ver decision-provenance.ts).
  reason?: string | null;
  rejectionReason?: string | null;
  /**
   * Fase 5.14 — `ReconciliationMatch.decidedBy` (Administrator.id real, ver
   * src/lib/auth/session.ts). `null` en decisiones históricas anteriores al
   * sistema real de autenticación (nunca inventado retroactivamente).
   * Opcional acá por el mismo motivo que `reason`/`rejectionReason`: no
   * romper callers/tests preexistentes que no lo pasan.
   */
  decidedBy?: string | null;
  /**
   * Fase 5.15 — `ReconciliationMatch.score`. Opcional acá por el mismo
   * motivo que `decidedBy`: no romper callers/tests preexistentes que no lo
   * pasan.
   */
  score?: number | null;
}

/** engineVersion de ShadowMatchLog para este pago — best-effort, ver types.ts::CalibrationCase.bankEngineVersion. */
export interface VersionMotorBancario {
  paymentTransactionId: string;
  engineVersion: string;
}

export interface OpcionesConstruccionDataset {
  origin?: CaseOrigin; // "REAL" por defecto — el caller marca "SYNTHETIC" explícitamente cuando corresponde
  /**
   * Fase 5.13 — candidatos REALES (`Unit.id`) que una evaluación AMBIGUA
   * (`candidateUnitId=null`) propuso, resueltos por `loader.ts` desde
   * `structuredEvidence.bank.topCandidates.unitCode` contra la organización
   * real del pago. Clave = `id` de la evaluación
   * (`PaymentEvidenceAssessmentRecord.id`). Ausente/vacío para una
   * evaluación → mismo comportamiento que antes de esta fase (UNRESOLVED si
   * no hay `candidateUnitId`). Nunca inventado — dato ya calculado por el
   * motor real, solo resuelto de `unitCode` a `id` real.
   */
  candidatosAmbiguosPorEvaluacionId?: Map<string, string[]>;
}

function scoreYTierDeCandidato(evaluacion: PaymentEvidenceAssessmentRecord) {
  if (!evaluacion.candidateUnitId) return { engineScore: null, tier: null };
  const familiaGanadora = evaluacion.families.find((f) => f.unitId === evaluacion.candidateUnitId && f.nature === "POSITIVE");
  return { engineScore: familiaGanadora?.score ?? null, tier: familiaGanadora?.tier ?? null };
}

/**
 * Construye el dataset completo — un CalibrationCase por cada evaluación
 * real (`PaymentEvidenceAssessmentRecord`) recibida, con su ground truth ya
 * resuelto contra las decisiones humanas del MISMO paymentTransactionId.
 */
export function construirDatasetDeCalibracion(
  evaluaciones: PaymentEvidenceAssessmentRecord[],
  decisiones: DecisionHumanaReal[],
  versionesMotor: VersionMotorBancario[] = [],
  opciones: OpcionesConstruccionDataset = {}
): CalibrationCase[] {
  const origin = opciones.origin ?? "REAL";
  const candidatosAmbiguosPorEvaluacionId = opciones.candidatosAmbiguosPorEvaluacionId ?? new Map<string, string[]>();

  const evaluacionesCrudas: EvaluacionCruda[] = evaluaciones.map((e) => {
    const id = e.id ?? `${e.paymentTransactionId}::${e.engineVersion}::${e.evaluatedAt}`;
    return {
      id,
      paymentTransactionId: e.paymentTransactionId,
      candidateUnitId: e.candidateUnitId,
      candidatosPosiblesUnitIds: candidatosAmbiguosPorEvaluacionId.get(id) ?? null,
      evaluatedAt: e.evaluatedAt,
    };
  });

  const decisionesPorPago = new Map<string, DecisionCruda[]>();
  // Fase 5.11 — índice separado por `id` para recuperar reason/rejectionReason
  // (DecisionCruda de ground-truth.ts, deliberadamente pura, no los carga —
  // no se le agregan campos que no necesita para vincular).
  const decisionesPorId = new Map<string, DecisionHumanaReal>();
  for (const d of decisiones) {
    const arr = decisionesPorPago.get(d.paymentTransactionId) ?? [];
    arr.push({ id: d.id, paymentTransactionId: d.paymentTransactionId, unitId: d.unitId, decision: d.decision, createdAt: d.createdAt });
    decisionesPorPago.set(d.paymentTransactionId, arr);
    decisionesPorId.set(d.id, d);
  }

  const versionMotorPorPago = new Map(versionesMotor.map((v) => [v.paymentTransactionId, v.engineVersion]));

  const casos: CalibrationCase[] = [];
  for (const evaluacion of evaluaciones) {
    const id = evaluacion.id ?? `${evaluacion.paymentTransactionId}::${evaluacion.engineVersion}::${evaluacion.evaluatedAt}`;
    const evaluacionCruda: EvaluacionCruda = {
      id,
      paymentTransactionId: evaluacion.paymentTransactionId,
      candidateUnitId: evaluacion.candidateUnitId,
      candidatosPosiblesUnitIds: candidatosAmbiguosPorEvaluacionId.get(id) ?? null,
      evaluatedAt: evaluacion.evaluatedAt,
    };
    const evaluacionesDelPago = evaluacionesCrudas.filter((e) => e.paymentTransactionId === evaluacion.paymentTransactionId);
    const decisionesDelPago = decisionesPorPago.get(evaluacion.paymentTransactionId) ?? [];

    const vinculo = vincularEvaluacionConDecision(evaluacionCruda, evaluacionesDelPago, decisionesDelPago);
    const { engineScore, tier } = scoreYTierDeCandidato(evaluacion);

    const decisionVinculada = vinculo.humanDecisionSourceId ? decisionesPorId.get(vinculo.humanDecisionSourceId) : undefined;
    const humanDecisionProvenance = decisionVinculada ? inferirProvenanceDeDecision(decisionVinculada.reason, decisionVinculada.rejectionReason) : null;
    const humanRejectionReason = decisionVinculada?.rejectionReason ?? null;
    const humanDecidedBy = decisionVinculada?.decidedBy ?? null;
    const humanDecisionScore = decisionVinculada?.score ?? null;

    casos.push({
      paymentTransactionId: evaluacion.paymentTransactionId,
      candidateUnitId: evaluacion.candidateUnitId,
      bankEngineVersion: versionMotorPorPago.get(evaluacion.paymentTransactionId) ?? null,
      evidenceScoreVersion: evaluacion.engineVersion,
      engineState: evaluacion.state,
      engineScore,
      tier,
      families: evaluacion.families,
      independentFamiliesConverging: evaluacion.independentFamiliesConverging,
      structuredEvidence: evaluacion.structuredEvidence,
      hasContradiction: evaluacion.hasContradiction,
      contradictionDetail: evaluacion.contradictionDetail,
      explanation: evaluacion.explanation,
      evaluatedAt: evaluacion.evaluatedAt,
      groundTruth: vinculo.groundTruth,
      humanDecision: vinculo.humanDecision,
      humanDecidedAt: vinculo.humanDecidedAt,
      humanDecisionSourceId: vinculo.humanDecisionSourceId,
      humanDecisionProvenance,
      humanRejectionReason,
      humanConfirmedUnitId: vinculo.humanConfirmedUnitId,
      humanDecidedBy,
      humanDecisionScore,
      origin,
    });
  }
  return casos;
}
