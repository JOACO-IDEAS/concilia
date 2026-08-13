// Fase 4.F — refresca ShadowMatchLog en dev-fixtures a la versión actual del
// motor (MATCH_ENGINE_VERSION). Las 10 filas existentes quedaron en
// engineVersion="3.4.0" (sembradas en Fase 3.7, antes de la corrección de
// ambigüedad de Fase 3.9 y antes de que existieran topCandidateScore/
// topCandidateTier). NO toca deterministic-matcher.ts/confidence-engine.ts/
// signals.ts — solo invoca el runner ya existente (mismo mecanismo que la
// corrida retroactiva de Fase 4 Parte B sobre producción). Escribe
// ÚNICAMENTE en ShadowMatchLog — nunca en PaymentTransaction/Obligation/
// UnitOwner/ReconciliationMatch.

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[refresh-shadow-matching] Corriendo sobre dev-fixtures (${info.host}).`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { ejecutarMatchingEnSombra } = await import("../../src/lib/reconciliation/shadow-runner.ts");
const { MATCH_ENGINE_VERSION } = await import("../../src/lib/reconciliation/version.ts");

async function contarTablasNoTocables() {
  return {
    paymentTransaction: await prisma.paymentTransaction.count(),
    obligation: await prisma.obligation.count(),
    unitOwner: await prisma.unitOwner.count(),
    unit: await prisma.unit.count(),
    reconciliationMatch: await prisma.reconciliationMatch.count(),
  };
}

const antes = await contarTablasNoTocables();
const shadowAntes = await prisma.shadowMatchLog.count();

const pagos = await prisma.paymentTransaction.findMany({ select: { id: true } });
console.log(`[refresh-shadow-matching] ${pagos.length} PaymentTransaction encontrados. Evaluando con motor ${MATCH_ENGINE_VERSION}...`);

for (const pago of pagos) {
  await ejecutarMatchingEnSombra(pago.id);
}

const despues = await contarTablasNoTocables();
const shadowDespues = await prisma.shadowMatchLog.count();

const porStatusActual = await prisma.shadowMatchLog.groupBy({
  by: ["status"],
  where: { engineVersion: MATCH_ENGINE_VERSION },
  _count: true,
});

console.log("\n=== Verificación: SOLO ShadowMatchLog debería haber cambiado ===");
console.table({
  PaymentTransaction: { antes: antes.paymentTransaction, despues: despues.paymentTransaction },
  Obligation: { antes: antes.obligation, despues: despues.obligation },
  UnitOwner: { antes: antes.unitOwner, despues: despues.unitOwner },
  Unit: { antes: antes.unit, despues: despues.unit },
  ReconciliationMatch: { antes: antes.reconciliationMatch, despues: despues.reconciliationMatch },
  ShadowMatchLog: { antes: shadowAntes, despues: shadowDespues },
});

const soloShadowCambio =
  antes.paymentTransaction === despues.paymentTransaction &&
  antes.obligation === despues.obligation &&
  antes.unitOwner === despues.unitOwner &&
  antes.unit === despues.unit &&
  antes.reconciliationMatch === despues.reconciliationMatch;

if (!soloShadowCambio) throw new Error("¡ALERTA! Alguna tabla que debía permanecer intacta cambió.");

console.log(`\nOK — únicamente ShadowMatchLog cambió (${shadowAntes} → ${shadowDespues} filas totales, incluye versiones viejas que no se borran).`);
console.log(`\nDistribución por status en engineVersion=${MATCH_ENGINE_VERSION} (la versión actual, la única que matching-observer.ts va a leer):`);
console.table(porStatusActual);

await prisma.$disconnect();
