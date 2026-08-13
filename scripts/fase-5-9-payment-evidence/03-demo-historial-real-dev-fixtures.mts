// Fase 5.9.1 — verificación real de historial append-only contra
// dev-fixtures. Usa un PaymentTransaction real ya identificado (Fase 5.9.1,
// auditoría de semántica) que produce PRE_CONCILIABLE con score 99 — no un
// caso NEEDS_DATA como el demo original de Fase 5.9. Corre el orquestador
// DOS veces sobre el MISMO pago y verifica que queden DOS eventos
// históricos, ambos leíbles individualmente, sin que el primero se pierda.
// Nunca corre contra producción.

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[demo-historial] Corriendo sobre dev-fixtures (${info.host}).`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { ejecutarEvaluacionSombraCompleta } = await import("../../src/lib/payment-evidence/evidence-score-runner.ts");
const { PrismaPaymentEvidenceAssessmentStore } = await import("../../src/lib/payment-evidence/evidence-score-store.ts");

const PAGO_REAL_PRE_CONCILIABLE = "cmskomn6m0000x91kcrtgb8cd"; // score=99, identificado en FASE_5_9_1_AUDITORIA_SEMANTICA.md Parte 2

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

const pago = await prisma.paymentTransaction.findUnique({ where: { id: PAGO_REAL_PRE_CONCILIABLE }, select: { id: true, amount: true, payerIdentifier: true } });
if (!pago) throw new Error(`No se encontró el PaymentTransaction real ${PAGO_REAL_PRE_CONCILIABLE} — abortando sin escribir nada.`);
console.log(`Usando PaymentTransaction real: ${pago.id} (amount=${pago.amount}, payerIdentifier=${pago.payerIdentifier ?? "null"})`);

const antes = await contarTablasProtegidas();
const evidenciaAntes = await prisma.paymentEvidenceAssessmentLog.count({ where: { paymentTransactionId: pago.id } });
console.log(`\nEvaluaciones históricas ANTES para este pago: ${evidenciaAntes} (esperado: 0, primera vez que se corre esta demo específica)`);

console.log("\n--- Primera corrida ---");
await ejecutarEvaluacionSombraCompleta(pago.id);
const trasPrimera = await prisma.paymentEvidenceAssessmentLog.count({ where: { paymentTransactionId: pago.id } });
console.log(`Evaluaciones históricas tras la 1ª corrida: ${trasPrimera} (esperado: ${evidenciaAntes + 1})`);
if (trasPrimera !== evidenciaAntes + 1) throw new Error("¡ALERTA! La primera corrida no agregó exactamente 1 evaluación.");

console.log("\n--- Segunda corrida (mismo pago, mismo engineVersion) ---");
await ejecutarEvaluacionSombraCompleta(pago.id);
const trasSegunda = await prisma.paymentEvidenceAssessmentLog.count({ where: { paymentTransactionId: pago.id } });
console.log(`Evaluaciones históricas tras la 2ª corrida: ${trasSegunda} (esperado: ${evidenciaAntes + 2} — NUNCA ${evidenciaAntes + 1}, que sería sobrescritura)`);
if (trasSegunda !== evidenciaAntes + 2) throw new Error("¡ALERTA! La segunda corrida no creó un evento histórico nuevo — puede estar sobrescribiendo.");

const store = new PrismaPaymentEvidenceAssessmentStore();
const historial = await store.listarHistorialPorPago(pago.id);
console.log(`\nHistorial completo leído para este pago: ${historial.length} evento(s).`);
for (const [i, evento] of historial.entries()) {
  console.log(`  [${i}] id=${evento.id} | createdAt=${evento.createdAt} | state=${evento.state} | candidateUnitId=${evento.candidateUnitId} | structuredEvidence.bank.signals=${evento.structuredEvidence?.bank?.signals.length ?? 0} señales`);
}

if (historial.length < 2) throw new Error("¡ALERTA! El historial leído tiene menos de 2 eventos — algo se perdió.");
const [primero, segundo] = historial;
if (primero.id === segundo.id) throw new Error("¡ALERTA! Los dos eventos tienen el mismo id — no son registros distintos.");
console.log(`\nOK — dos eventos distintos, ambos leíbles individualmente: id[0]=${primero.id} !== id[1]=${segundo.id}.`);

const despues = await contarTablasProtegidas();
console.log("\n=== Verificación: solo PaymentEvidenceAssessmentLog debió cambiar ===");
console.table({
  PaymentTransaction: { antes: antes.paymentTransaction, despues: despues.paymentTransaction },
  Obligation: { antes: antes.obligation, despues: despues.obligation },
  UnitOwner: { antes: antes.unitOwner, despues: despues.unitOwner },
  Unit: { antes: antes.unit, despues: despues.unit },
  Organization: { antes: antes.organization, despues: despues.organization },
  ReconciliationMatch: { antes: antes.reconciliationMatch, despues: despues.reconciliationMatch },
  AgentObservation: { antes: antes.agentObservation, despues: despues.agentObservation },
});

const soloEsperadoCambio =
  antes.paymentTransaction === despues.paymentTransaction &&
  antes.obligation === despues.obligation &&
  antes.unitOwner === despues.unitOwner &&
  antes.unit === despues.unit &&
  antes.organization === despues.organization &&
  antes.reconciliationMatch === despues.reconciliationMatch &&
  antes.agentObservation === despues.agentObservation;

if (!soloEsperadoCambio) throw new Error("¡ALERTA! Cambió algo que no debía.");
console.log("\nOK — todas las tablas contables/de dominio permanecen idénticas. Solo PaymentEvidenceAssessmentLog creció, y lo hizo por ACUMULACIÓN (+2), nunca por sobrescritura.");

await prisma.$disconnect();
