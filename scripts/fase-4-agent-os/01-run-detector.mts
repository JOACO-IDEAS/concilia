// Fase 4 Parte D — corre el Agente de Control Operativo contra dev-fixtures.
// Solo escribe en AgentObservation (ver compliance-detector.ts /
// observation-store.ts) — nunca en Provider/ProviderDocument/Organization
// ni en ninguna tabla de conciliación.

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[run-detector] Corriendo sobre dev-fixtures (${info.host}).`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { ejecutarAgenteDeControlOperativo } = await import("../../src/lib/compliance/compliance-detector.ts");

async function contarTablasNoTocables() {
  return {
    provider: await prisma.provider.count(),
    providerOrganization: await prisma.providerOrganization.count(),
    providerDocument: await prisma.providerDocument.count(),
    organization: await prisma.organization.count(),
    paymentTransaction: await prisma.paymentTransaction.count(),
    reconciliationMatch: await prisma.reconciliationMatch.count(),
    obligation: await prisma.obligation.count(),
    unitOwner: await prisma.unitOwner.count(),
  };
}

const antes = await contarTablasNoTocables();
const obsAntes = await prisma.agentObservation.count();

const resultado = await prisma.$transaction((tx) => ejecutarAgenteDeControlOperativo(tx));

const despues = await contarTablasNoTocables();
const obsDespues = await prisma.agentObservation.count();

console.log("\n=== Resultado de la detección ===");
console.log(resultado);

console.log("\n=== Verificación: SOLO AgentObservation debería haber cambiado ===");
console.table({
  Provider: { antes: antes.provider, despues: despues.provider },
  ProviderOrganization: { antes: antes.providerOrganization, despues: despues.providerOrganization },
  ProviderDocument: { antes: antes.providerDocument, despues: despues.providerDocument },
  Organization: { antes: antes.organization, despues: despues.organization },
  PaymentTransaction: { antes: antes.paymentTransaction, despues: despues.paymentTransaction },
  ReconciliationMatch: { antes: antes.reconciliationMatch, despues: despues.reconciliationMatch },
  Obligation: { antes: antes.obligation, despues: despues.obligation },
  UnitOwner: { antes: antes.unitOwner, despues: despues.unitOwner },
  AgentObservation: { antes: obsAntes, despues: obsDespues },
});

const soloObservacionCambio =
  antes.provider === despues.provider &&
  antes.providerOrganization === despues.providerOrganization &&
  antes.providerDocument === despues.providerDocument &&
  antes.organization === despues.organization &&
  antes.paymentTransaction === despues.paymentTransaction &&
  antes.reconciliationMatch === despues.reconciliationMatch &&
  antes.obligation === despues.obligation &&
  antes.unitOwner === despues.unitOwner;

if (!soloObservacionCambio) throw new Error("¡ALERTA! Alguna tabla que debía permanecer intacta cambió.");
console.log(`\nOK — únicamente AgentObservation cambió (${obsAntes} → ${obsDespues}).`);

await prisma.$disconnect();
