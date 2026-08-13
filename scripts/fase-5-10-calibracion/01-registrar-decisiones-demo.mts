// Fase 5.10 — Parte 15/9: el audit (00-auditoria-datos-reales.mts) probó que
// HOY no existe ningún caso de ground truth organicamente vinculado en
// dev-fixtures (los 2 ReconciliationMatch existentes, de la demo Fase 5.8,
// apuntan a un pago cuya única evaluación real tiene candidateUnitId=null —
// no vinculable). Sin AL MENOS un caso real vinculado, el pipeline de
// calibración completo (ground-truth → dataset → métricas → matriz →
// desacuerdos) no se puede demostrar contra datos reales, solo contra tests
// unitarios sintéticos aislados.
//
// Este script escribe EXACTAMENTE 2 filas nuevas de ReconciliationMatch,
// usando el `candidateUnitId` REAL ya producido por el motor real (leído en
// vivo de PaymentEvidenceAssessmentLog, nunca hardcodeado a ciegas) sobre 2
// de los 10 PaymentTransaction reales con organización-con-unidades
// (identificados en Fase 5.9.1, confirmados en el audit de esta fase):
//   - cmskomn6m0000x91kcrtgb8cd (score=99, PRE_CONCILIABLE) → APPROVED (acuerdo → TP)
//   - cmskomnmg0001x91k4tje0x4j (score=40, PRE_CONCILIABLE) → REJECTED (desacuerdo → FP)
// Ambas quedan explícitamente etiquetadas en `reason`/`rejectionReason` como
// decisión SINTÉTICA de demostración de esta fase — nunca se hacen pasar por
// una decisión real de un administrador (Parte 15: separar REAL vs
// SYNTHETIC). El dataset de calibración (dataset.ts) también las marca
// `origin: "SYNTHETIC"` cuando el caller así lo indica.
//
// Mismo patrón de seguridad que scripts/fase-5-8-human-decision/01-demo-real-dev-fixtures.mts:
// preflight de entorno primero, verificación antes/después de que SOLO
// ReconciliationMatch cambió. Nunca corre contra producción.

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[Fase 5.10 — decisiones demo] Corriendo sobre dev-fixtures (${info.host}).`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { registrarDecisionHumana } = await import("../../src/lib/reconciliation/human-decision.ts");
const { ejecutarEvaluacionSombraCompleta } = await import("../../src/lib/payment-evidence/evidence-score-runner.ts");

const PAGO_APROBADO_ID = "cmskomn6m0000x91kcrtgb8cd"; // score=99, PRE_CONCILIABLE — ya tiene PaymentEvidenceAssessmentLog real (confirmado en el audit)
const PAGO_RECHAZADO_ID = "cmskomnmg0001x91k4tje0x4j"; // score=40, PRE_CONCILIABLE en ShadowMatchLog — NUNCA pasó todavía por evidence-score-runner

async function contarTablasProtegidas() {
  return {
    paymentTransaction: await prisma.paymentTransaction.count(),
    obligation: await prisma.obligation.count(),
    unitOwner: await prisma.unitOwner.count(),
    unit: await prisma.unit.count(),
    organization: await prisma.organization.count(),
    agentObservation: await prisma.agentObservation.count(),
  };
}

/**
 * Trae la evaluación real más reciente de este pago. Si todavía no existe
 * ninguna (el pago ya fue evaluado por el motor bancario real ShadowMatchLog,
 * pero nunca pasó por evidence-score-runner.ts), la genera corriendo el
 * MISMO orquestador real que usan los call sites de producción
 * (`ejecutarEvaluacionSombraCompleta` — evidence-score-runner.ts, no está en
 * la lista de archivos protegidos de esta fase) — nunca fabrica una fila a
 * mano, nunca inventa un candidateUnitId.
 */
async function leerOGenerarEvaluacionReal(paymentTransactionId: string) {
  let fila = await prisma.paymentEvidenceAssessmentLog.findFirst({ where: { paymentTransactionId }, orderBy: { createdAt: "desc" } });
  if (!fila) {
    console.log(`(sin evaluación previa para ${paymentTransactionId} — corriendo evidence-score-runner real para generarla)`);
    await ejecutarEvaluacionSombraCompleta(paymentTransactionId);
    fila = await prisma.paymentEvidenceAssessmentLog.findFirst({ where: { paymentTransactionId }, orderBy: { createdAt: "desc" } });
  }
  if (!fila) throw new Error(`No se pudo generar ninguna PaymentEvidenceAssessmentLog real para ${paymentTransactionId} — abortando sin escribir nada.`);
  if (!fila.candidateUnitId) throw new Error(`La evaluación real de ${paymentTransactionId} tiene candidateUnitId=null — no vinculable, abortando sin escribir nada.`);
  return fila;
}

const antes = await contarTablasProtegidas();
const matchesAntes = await prisma.reconciliationMatch.count();
const evaluacionesAntes = await prisma.paymentEvidenceAssessmentLog.count();

const evalAprobado = await leerOGenerarEvaluacionReal(PAGO_APROBADO_ID);
const evalRechazado = await leerOGenerarEvaluacionReal(PAGO_RECHAZADO_ID);

async function obligationIdDeLaUnidad(unitId: string): Promise<string | null> {
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { obligations: { select: { id: true }, take: 1 } } });
  return unit?.obligations[0]?.id ?? null;
}

function signalsMatcheadasDe(fila: typeof evalAprobado): { signal: string; tier: number; matched: boolean; strength: string; evidence: string }[] {
  const structuredEvidence = fila.structuredEvidence as { bank?: { signals?: { signal: string; tier: number; matched: boolean; strength: string; evidence: string }[] } } | null;
  return (structuredEvidence?.bank?.signals ?? []).filter((s) => s.matched);
}

console.log(`\nAPROBADO: pago=${PAGO_APROBADO_ID}, candidateUnitId real=${evalAprobado.candidateUnitId}, state=${evalAprobado.state}`);
console.log(`RECHAZADO: pago=${PAGO_RECHAZADO_ID}, candidateUnitId real=${evalRechazado.candidateUnitId}, state=${evalRechazado.state}`);

const obligationIdAprobado = await obligationIdDeLaUnidad(evalAprobado.candidateUnitId as string);
const obligationIdRechazado = await obligationIdDeLaUnidad(evalRechazado.candidateUnitId as string);

const aprobado = await prisma.$transaction((tx) =>
  registrarDecisionHumana(tx, {
    paymentTransactionId: PAGO_APROBADO_ID,
    unitId: evalAprobado.candidateUnitId as string,
    obligationId: obligationIdAprobado,
    decision: "APPROVED",
    score: 99,
    signals: signalsMatcheadasDe(evalAprobado) as never,
    reason: "Fase 5.10 — decisión SINTÉTICA de demostración de calibración (dev-fixtures). Aprueba el candidato REAL propuesto por el motor real para este pago.",
    decidedBy: null,
  })
);
console.log("APPROVED registrado:", aprobado);

const rechazado = await prisma.$transaction((tx) =>
  registrarDecisionHumana(tx, {
    paymentTransactionId: PAGO_RECHAZADO_ID,
    unitId: evalRechazado.candidateUnitId as string,
    obligationId: obligationIdRechazado,
    decision: "REJECTED",
    score: 40,
    signals: signalsMatcheadasDe(evalRechazado) as never,
    reason: "Fase 5.10 — decisión SINTÉTICA de demostración de calibración (dev-fixtures). Rechaza el candidato REAL propuesto por el motor real para este pago, para producir un caso de desacuerdo (FP) demostrable.",
    decidedBy: null,
    rejectionReason: "Demostración Fase 5.10 — no hay un administrador real detrás de este rechazo, es un dato sintético para poblar el dataset de calibración con al menos un desacuerdo real.",
  })
);
console.log("REJECTED registrado:", rechazado);

const despues = await contarTablasProtegidas();
const matchesDespues = await prisma.reconciliationMatch.count();
const evaluacionesDespues = await prisma.paymentEvidenceAssessmentLog.count();

console.log("\n=== Verificación: solo ReconciliationMatch (+2) y PaymentEvidenceAssessmentLog (+0 o +1, real, append-only) debieron cambiar ===");
console.table({
  PaymentTransaction: { antes: antes.paymentTransaction, despues: despues.paymentTransaction },
  Obligation: { antes: antes.obligation, despues: despues.obligation },
  UnitOwner: { antes: antes.unitOwner, despues: despues.unitOwner },
  Unit: { antes: antes.unit, despues: despues.unit },
  Organization: { antes: antes.organization, despues: despues.organization },
  AgentObservation: { antes: antes.agentObservation, despues: despues.agentObservation },
  ReconciliationMatch: { antes: matchesAntes, despues: matchesDespues },
  PaymentEvidenceAssessmentLog: { antes: evaluacionesAntes, despues: evaluacionesDespues },
});

const soloLoEsperadoCambio =
  antes.paymentTransaction === despues.paymentTransaction &&
  antes.obligation === despues.obligation &&
  antes.unitOwner === despues.unitOwner &&
  antes.unit === despues.unit &&
  antes.organization === despues.organization &&
  antes.agentObservation === despues.agentObservation &&
  matchesDespues - matchesAntes === 2 &&
  evaluacionesDespues - evaluacionesAntes <= 1; // 0 si ya existía, 1 si evidence-score-runner tuvo que generarla

if (!soloLoEsperadoCambio) throw new Error("¡ALERTA! Cambió algo que no debía, o los conteos no fueron los esperados.");
console.log(`\nOK — ReconciliationMatch: ${matchesAntes} → ${matchesDespues} (+2). PaymentEvidenceAssessmentLog: ${evaluacionesAntes} → ${evaluacionesDespues}. Todo lo demás, idéntico. Nada tocó AUTO, WhatsApp, ni ningún dato de producción.`);

await prisma.$disconnect();
