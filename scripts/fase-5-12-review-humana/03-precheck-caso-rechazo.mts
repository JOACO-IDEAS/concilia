// Fase 5.12 — precheck SOLO LECTURA antes de que el usuario haga el rechazo
// real desde la UI. Confirma las 3 condiciones pedidas explícitamente:
// (1) entorno=fixtures, (2) el caso no es de producción (organización
// marcada [FIXTURE]), (3) no existe ya ninguna decisión para este pago+unidad
// que impida probar el rechazo.

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[Fase 5.12 — precheck rechazo] Entorno confirmado: fixtures (host ${info.host}).\n`);

const { prisma } = await import("../../src/lib/prisma.ts");

const PAYMENT_TRANSACTION_ID = "cmskomo0i0002x91kbsxkopp1";
const CANDIDATE_UNIT_ID = "cmskohfpi000sgg1kcamf9swx";

console.log("=== 1. Entorno ===");
console.log(`OK — fixtures (${info.host}), distinto del fragmento de producción conocido.`);

console.log("\n=== 2. El caso no es producción ===");
const unidad = await prisma.unit.findUnique({
  where: { id: CANDIDATE_UNIT_ID },
  select: { code: true, organization: { select: { name: true } } },
});
const pago = await prisma.paymentTransaction.findUnique({ where: { id: PAYMENT_TRANSACTION_ID }, select: { amount: true, concept: true } });
console.log(`Unidad: UF ${unidad?.code}, organización: "${unidad?.organization.name}"`);
console.log(`Pago: $${pago?.amount.toNumber()} — ${pago?.concept}`);
const esFixture = unidad?.organization.name.includes("[FIXTURE]") ?? false;
console.log(esFixture ? "OK — la organización está marcada [FIXTURE], dato de prueba, nunca real de producción." : "⚠ ALERTA — no se pudo confirmar que sea un dato de fixture.");

console.log("\n=== 3. No existe ya una decisión que bloquee el rechazo ===");
const decisionExistente = await prisma.reconciliationMatch.findFirst({
  where: { paymentTransactionId: PAYMENT_TRANSACTION_ID, unitId: CANDIDATE_UNIT_ID },
});
console.log(decisionExistente ? `⚠ YA EXISTE una decisión (${decisionExistente.decision}, id=${decisionExistente.id}) — el caso no está libre para probar el rechazo.` : "OK — ninguna ReconciliationMatch existente para este pago+unidad. El caso está libre.");

console.log("\n=== Resultado ===");
if (esFixture && !decisionExistente) {
  console.log(`LISTO PARA LA PRUEBA. Entrá a /conciliacion/revision-humana y hacé clic en "Rechazar" sobre UF ${unidad?.code} (${unidad?.organization.name}), escribí un motivo real, y confirmá.`);
} else {
  console.log("NO LISTO — revisar las alertas de arriba antes de continuar.");
}

await prisma.$disconnect();
