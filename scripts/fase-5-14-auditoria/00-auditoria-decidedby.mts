import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";
cargarEntornoDeFixturesYVerificar();
const { prisma } = await import("../../src/lib/prisma.ts");
const filas = await prisma.reconciliationMatch.findMany({ select: { id: true, decision: true, decidedBy: true, createdAt: true }, orderBy: { createdAt: "asc" } });
console.table(filas.map(f => ({ id: f.id, decision: f.decision, decidedBy: f.decidedBy, createdAt: f.createdAt.toISOString() })));
const administradores = await prisma.administrator.findMany({ select: { id: true, email: true } });
console.log("Administradores reales en fixtures:", administradores);
await prisma.$disconnect();
