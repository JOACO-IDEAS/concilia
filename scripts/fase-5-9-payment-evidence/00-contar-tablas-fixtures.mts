// Fase 5.9 — conteo de tablas relevantes contra dev-fixtures, solo lectura.
// Corrido ANTES y DESPUÉS de la migración y de cualquier escritura real,
// mismo patrón ya establecido en fases anteriores.
import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[contar-tablas-fixtures] Conectando SOLO LECTURA a dev-fixtures (${info.host}).`);

const { prisma } = await import("../../src/lib/prisma.ts");

const conteos = {
  organization: await prisma.organization.count(),
  unit: await prisma.unit.count(),
  unitOwner: await prisma.unitOwner.count(),
  obligation: await prisma.obligation.count(),
  paymentTransaction: await prisma.paymentTransaction.count(),
  paymentNotice: await prisma.paymentNotice.count(),
  reconciliationMatch: await prisma.reconciliationMatch.count(),
  shadowMatchLog: await prisma.shadowMatchLog.count(),
  agentObservation: await prisma.agentObservation.count(),
};

let paymentEvidenceAssessmentLog: number | string = "tabla no existe todavía";
try {
  paymentEvidenceAssessmentLog = await prisma.paymentEvidenceAssessmentLog.count();
} catch {
  // esperado antes de la migración
}

console.table({ ...conteos, paymentEvidenceAssessmentLog });

await prisma.$disconnect();
