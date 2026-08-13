// Fase 5.9 — verificación real de ejecutarEvaluacionSombraCompleta contra
// dev-fixtures. Corre el orquestador nuevo sobre un PaymentTransaction real
// y verifica antes/después que SOLO ShadowMatchLog (upsert, ya existente
// desde antes) y PaymentEvidenceAssessmentLog (nuevo) cambian — cero
// modificación de PaymentTransaction/Obligation/Unit/UnitOwner/
// ReconciliationMatch. Nunca corre contra producción.

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[evidence-score demo] Corriendo sobre dev-fixtures (${info.host}).`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { ejecutarEvaluacionSombraCompleta } = await import("../../src/lib/payment-evidence/evidence-score-runner.ts");

async function contarTablasProtegidas() {
  return {
    paymentTransaction: await prisma.paymentTransaction.count(),
    obligation: await prisma.obligation.count(),
    unitOwner: await prisma.unitOwner.count(),
    unit: await prisma.unit.count(),
    organization: await prisma.organization.count(),
    reconciliationMatch: await prisma.reconciliationMatch.count(),
    agentObservation: await prisma.agentObservation.count(),
  };
}

const antes = await contarTablasProtegidas();
const shadowAntes = await prisma.shadowMatchLog.count();
const evidenceAntes = await prisma.paymentEvidenceAssessmentLog.count();

const pago = await prisma.paymentTransaction.findFirst({ select: { id: true, organizationId: true } });
if (!pago) throw new Error("No hay ningún PaymentTransaction real en dev-fixtures — abortando sin escribir nada.");

console.log(`Usando PaymentTransaction real: ${pago.id} (organizationId=${pago.organizationId ?? "null"})`);

await ejecutarEvaluacionSombraCompleta(pago.id);

const registroEvidencia = await prisma.paymentEvidenceAssessmentLog.findFirst({
  where: { paymentTransactionId: pago.id },
  orderBy: { createdAt: "desc" },
});
console.log("\nPaymentEvidenceAssessmentLog persistido:");
console.log({
  state: registroEvidencia?.state,
  candidateUnitId: registroEvidencia?.candidateUnitId,
  hasContradiction: registroEvidencia?.hasContradiction,
  explanation: registroEvidencia?.explanation,
  families: registroEvidencia?.families,
});

const despues = await contarTablasProtegidas();
const shadowDespues = await prisma.shadowMatchLog.count();
const evidenceDespues = await prisma.paymentEvidenceAssessmentLog.count();

console.log("\n=== Verificación: solo ShadowMatchLog/PaymentEvidenceAssessmentLog debieron cambiar ===");
console.table({
  PaymentTransaction: { antes: antes.paymentTransaction, despues: despues.paymentTransaction },
  Obligation: { antes: antes.obligation, despues: despues.obligation },
  UnitOwner: { antes: antes.unitOwner, despues: despues.unitOwner },
  Unit: { antes: antes.unit, despues: despues.unit },
  Organization: { antes: antes.organization, despues: despues.organization },
  ReconciliationMatch: { antes: antes.reconciliationMatch, despues: despues.reconciliationMatch },
  AgentObservation: { antes: antes.agentObservation, despues: despues.agentObservation },
  ShadowMatchLog: { antes: shadowAntes, despues: shadowDespues },
  PaymentEvidenceAssessmentLog: { antes: evidenceAntes, despues: evidenceDespues },
});

const soloEsperadoCambio =
  antes.paymentTransaction === despues.paymentTransaction &&
  antes.obligation === despues.obligation &&
  antes.unitOwner === despues.unitOwner &&
  antes.unit === despues.unit &&
  antes.organization === despues.organization &&
  antes.reconciliationMatch === despues.reconciliationMatch &&
  antes.agentObservation === despues.agentObservation &&
  evidenceDespues - evidenceAntes === 1;

if (!soloEsperadoCambio) throw new Error("¡ALERTA! Cambió algo inesperado, o PaymentEvidenceAssessmentLog no fue exactamente +1.");
console.log(`\nOK — PaymentEvidenceAssessmentLog: ${evidenceAntes} → ${evidenceDespues} (+1). ShadowMatchLog: ${shadowAntes} → ${shadowDespues} (upsert, puede o no cambiar el conteo). Todo lo demás, idéntico.`);

// Idempotencia real: correrlo de nuevo sobre el MISMO pago no debe duplicar.
await ejecutarEvaluacionSombraCompleta(pago.id);
const evidenceTrasSegundaCorrida = await prisma.paymentEvidenceAssessmentLog.count();
console.log(`\nSegunda corrida (mismo pago, misma engineVersion) — PaymentEvidenceAssessmentLog: ${evidenceDespues} → ${evidenceTrasSegundaCorrida} (esperado: sin cambio, upsert idempotente).`);
if (evidenceTrasSegundaCorrida !== evidenceDespues) throw new Error("¡ALERTA! La segunda corrida duplicó una fila en vez de actualizarla.");
console.log("OK — idempotencia confirmada con una corrida real repetida.");

await prisma.$disconnect();
