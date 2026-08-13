// Fase 3.7 — SIEMPRE correr esto primero. Confirma la rama objetivo, que NO
// es producción, y el estado actual de las tablas relevantes ANTES de
// escribir un solo byte. No escribe nada.

import { cargarEntornoDeFixturesYVerificar } from "./lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log("=== Fase 3.7 — verificación de rama ===");
console.log(`DATABASE_URL host: ${info.host}`);
console.log(`¿Es producción?: ${info.esProduccion ? "SÍ — DETENIDO" : "NO"}`);

const { PrismaClient } = await import("../../src/generated/prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const adapter = new PrismaPg({ connectionString: info.databaseUrl });
const prisma = new PrismaClient({ adapter });

const [org, unit, unitOwner, obligation, tx, match, notice, shadow] = await Promise.all([
  prisma.organization.count(),
  prisma.unit.count(),
  prisma.unitOwner.count(),
  prisma.obligation.count(),
  prisma.paymentTransaction.count(),
  prisma.reconciliationMatch.count(),
  prisma.paymentNotice.count(),
  prisma.shadowMatchLog.count(),
]);

console.log("\nEstado actual de la rama dev-fixtures (antes de sembrar nada):");
console.table({
  Organization: org,
  Unit: unit,
  UnitOwner: unitOwner,
  Obligation: obligation,
  PaymentTransaction: tx,
  ReconciliationMatch: match,
  PaymentNotice: notice,
  ShadowMatchLog: shadow,
});

const yaTieneFixtures = await prisma.organization.count({ where: { name: { startsWith: "[FIXTURE]" } } });
console.log(`\nOrganizaciones ya marcadas [FIXTURE] en esta rama: ${yaTieneFixtures}`);

await prisma.$disconnect();
