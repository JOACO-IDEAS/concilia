// Fase 4.F — corre el Observador de Matching contra dev-fixtures. Solo
// escribe en AgentObservation (ver matching-observer.ts / observation-store.ts)
// — nunca en PaymentTransaction/ShadowMatchLog/ReconciliationMatch/Obligation/
// UnitOwner. Requiere haber corrido 03-refresh-shadow-matching.mts antes
// (si no, no hay ShadowMatchLog en la versión actual del motor para leer).

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[run-matching-observer] Corriendo sobre dev-fixtures (${info.host}).`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { ejecutarObservadorDeMatching } = await import("../../src/lib/reconciliation/matching-observer.ts");

async function contarTablasNoTocables() {
  return {
    paymentTransaction: await prisma.paymentTransaction.count(),
    shadowMatchLog: await prisma.shadowMatchLog.count(),
    reconciliationMatch: await prisma.reconciliationMatch.count(),
    obligation: await prisma.obligation.count(),
    unitOwner: await prisma.unitOwner.count(),
    provider: await prisma.provider.count(),
    providerDocument: await prisma.providerDocument.count(),
  };
}

const antes = await contarTablasNoTocables();
const obsAntes = await prisma.agentObservation.count();

// dev-fixtures tiene 45 ShadowMatchLog AMBIGUOUS/BLOCKED (ver refresh de
// 03-refresh-shadow-matching.mts) — el timeout default de 5s de Prisma para
// transacciones interactivas no alcanza para 45 upserts secuenciales contra
// Neon vía pooler. Se sube solo para este script (nunca se toca el código
// de la librería).
const resultado = await prisma.$transaction((tx) => ejecutarObservadorDeMatching(tx), { timeout: 30000 });

const despues = await contarTablasNoTocables();
const obsDespues = await prisma.agentObservation.count();

console.log("\n=== Resultado del Observador de Matching ===");
console.log(resultado);

console.log("\n=== Verificación: SOLO AgentObservation debería haber cambiado ===");
console.table({
  PaymentTransaction: { antes: antes.paymentTransaction, despues: despues.paymentTransaction },
  ShadowMatchLog: { antes: antes.shadowMatchLog, despues: despues.shadowMatchLog },
  ReconciliationMatch: { antes: antes.reconciliationMatch, despues: despues.reconciliationMatch },
  Obligation: { antes: antes.obligation, despues: despues.obligation },
  UnitOwner: { antes: antes.unitOwner, despues: despues.unitOwner },
  Provider: { antes: antes.provider, despues: despues.provider },
  ProviderDocument: { antes: antes.providerDocument, despues: despues.providerDocument },
  AgentObservation: { antes: obsAntes, despues: obsDespues },
});

const soloObservacionCambio =
  antes.paymentTransaction === despues.paymentTransaction &&
  antes.shadowMatchLog === despues.shadowMatchLog &&
  antes.reconciliationMatch === despues.reconciliationMatch &&
  antes.obligation === despues.obligation &&
  antes.unitOwner === despues.unitOwner &&
  antes.provider === despues.provider &&
  antes.providerDocument === despues.providerDocument;

if (!soloObservacionCambio) throw new Error("¡ALERTA! Alguna tabla que debía permanecer intacta cambió.");
console.log(`\nOK — únicamente AgentObservation cambió (${obsAntes} → ${obsDespues}).`);

const observacionesMatching = await prisma.agentObservation.findMany({ where: { agentType: "MATCHING" } });
console.log(`\n=== ${observacionesMatching.length} observación(es) de MATCHING generadas ===`);
for (const o of observacionesMatching) {
  console.log(`- [${o.severity}] ${o.type} — pago ${o.paymentTransactionId} — org=${o.organizationId ?? "(sin resolver)"}`);
  console.log(`  ${o.explanation}`);
}

await prisma.$disconnect();
