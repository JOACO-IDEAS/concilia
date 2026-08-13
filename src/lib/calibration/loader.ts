// Fase 5.10 — carga real de datos desde Prisma para el dataset de
// calibración. SOLO LECTURA — ningún método de este archivo escribe nada.
// Separado de dataset.ts a propósito: dataset.ts es puro/testeable sin DB,
// este archivo es el único que conoce Prisma.

import { prisma } from "@/lib/prisma";
import type { PaymentEvidenceAssessmentRecord } from "@/lib/payment-evidence/evidence-score-store";
import type { EvidenceFamilyName, EvidenceFamilyResult, PaymentEvidenceState } from "@/lib/payment-evidence/evidence-score";
import type { StructuredEvidenceSnapshot } from "@/lib/payment-evidence/evidence-score-store";
import { construirDatasetDeCalibracion, type DecisionHumanaReal, type VersionMotorBancario } from "./dataset";
import type { CalibrationCase, CaseOrigin } from "./types";

/** Trae TODAS las evaluaciones reales (historial completo, no solo "la última") — solo lectura. */
export async function cargarTodasLasEvaluaciones(): Promise<PaymentEvidenceAssessmentRecord[]> {
  const filas = await prisma.paymentEvidenceAssessmentLog.findMany({ orderBy: { createdAt: "asc" } });
  return filas.map((f) => ({
    id: f.id,
    paymentTransactionId: f.paymentTransactionId,
    engineVersion: f.engineVersion,
    state: f.state as PaymentEvidenceState,
    candidateUnitId: f.candidateUnitId,
    families: f.families as unknown as EvidenceFamilyResult[],
    independentFamiliesConverging: f.independentFamiliesConverging as unknown as EvidenceFamilyName[],
    hasContradiction: f.hasContradiction,
    contradictionDetail: f.contradictionDetail,
    explanation: f.explanation,
    structuredEvidence: (f.structuredEvidence as StructuredEvidenceSnapshot | null) ?? null,
    evaluatedAt: f.evaluatedAt.toISOString(),
    createdAt: f.createdAt.toISOString(),
  }));
}

/** Trae TODAS las decisiones humanas reales (ReconciliationMatch, cualquier `decision` — el filtro a APPROVED/REJECTED ocurre en ground-truth.ts) — solo lectura. */
export async function cargarTodasLasDecisiones(): Promise<DecisionHumanaReal[]> {
  const filas = await prisma.reconciliationMatch.findMany({ orderBy: { createdAt: "asc" } });
  return filas.map((f) => ({
    id: f.id,
    paymentTransactionId: f.paymentTransactionId,
    unitId: f.unitId,
    decision: f.decision,
    createdAt: f.createdAt.toISOString(),
    reason: f.reason,
    rejectionReason: f.rejectionReason,
    decidedBy: f.decidedBy,
    score: f.score,
  }));
}

/** engineVersion de ShadowMatchLog por pago — best-effort, ver types.ts::CalibrationCase.bankEngineVersion. Si un pago tiene más de una fila (distintas versiones a lo largo del tiempo), se toma la más reciente por `updatedAt`. Solo lectura. */
export async function cargarVersionesDeMotorBancario(): Promise<VersionMotorBancario[]> {
  const filas = await prisma.shadowMatchLog.findMany({
    select: { paymentTransactionId: true, engineVersion: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
  });
  const porPago = new Map<string, VersionMotorBancario>();
  for (const f of filas) {
    porPago.set(f.paymentTransactionId, { paymentTransactionId: f.paymentTransactionId, engineVersion: f.engineVersion });
  }
  return [...porPago.values()];
}

/**
 * Fase 5.13 — resuelve, para cada evaluación AMBIGUA (`candidateUnitId=null`
 * con `structuredEvidence.bank.topCandidates` real), los `Unit.id` REALES
 * que corresponden a esos `unitCode` — contra la organización real del pago
 * (`@@unique([organizationId, code])`, nunca ambiguo entre consorcios
 * distintos). Solo lectura, 2 queries batch (nunca N+1). Un código que no
 * resuelve a ningún `Unit` vigente se OMITE — nunca se inventa un id.
 */
async function resolverCandidatosAmbiguosPorEvaluacionId(evaluaciones: PaymentEvidenceAssessmentRecord[]): Promise<Map<string, string[]>> {
  const resultado = new Map<string, string[]>();

  const ambiguas = evaluaciones.filter((e) => e.id && !e.candidateUnitId && (e.structuredEvidence?.bank?.topCandidates?.length ?? 0) >= 1);
  if (ambiguas.length === 0) return resultado;

  const paymentIds = [...new Set(ambiguas.map((e) => e.paymentTransactionId))];
  const pagos = await prisma.paymentTransaction.findMany({ where: { id: { in: paymentIds } }, select: { id: true, organizationId: true } });
  const organizationIdPorPago = new Map(pagos.map((p) => [p.id, p.organizationId]));

  const organizationIds = [...new Set([...organizationIdPorPago.values()].filter((id): id is string => id !== null))];
  const codes = [...new Set(ambiguas.flatMap((e) => e.structuredEvidence?.bank?.topCandidates?.map((c) => c.unitCode) ?? []))];
  if (organizationIds.length === 0 || codes.length === 0) return resultado;

  const unidades = await prisma.unit.findMany({ where: { organizationId: { in: organizationIds }, code: { in: codes } }, select: { id: true, code: true, organizationId: true } });
  const unitIdPorOrgYCode = new Map(unidades.map((u) => [`${u.organizationId}::${u.code}`, u.id]));

  for (const evaluacion of ambiguas) {
    const organizationId = organizationIdPorPago.get(evaluacion.paymentTransactionId);
    if (!organizationId) continue; // pago sin organización real resuelta — nada que resolver
    const unitIdsReales = (evaluacion.structuredEvidence?.bank?.topCandidates ?? [])
      .map((c) => unitIdPorOrgYCode.get(`${organizationId}::${c.unitCode}`))
      .filter((id): id is string => id !== undefined);
    if (unitIdsReales.length > 0) resultado.set(evaluacion.id as string, unitIdsReales);
  }

  return resultado;
}

/**
 * Carga el dataset de calibración COMPLETO contra la base real conectada
 * (dev-fixtures o producción, según qué `DATABASE_URL` esté resuelta — este
 * archivo no decide eso, ver scripts/prisma-safety). 100% solo lectura.
 */
export async function cargarDatasetDeCalibracionReal(opciones: { origin?: CaseOrigin } = {}): Promise<CalibrationCase[]> {
  const [evaluaciones, decisiones, versionesMotor] = await Promise.all([
    cargarTodasLasEvaluaciones(),
    cargarTodasLasDecisiones(),
    cargarVersionesDeMotorBancario(),
  ]);
  const candidatosAmbiguosPorEvaluacionId = await resolverCandidatosAmbiguosPorEvaluacionId(evaluaciones);
  return construirDatasetDeCalibracion(evaluaciones, decisiones, versionesMotor, { ...opciones, candidatosAmbiguosPorEvaluacionId });
}
