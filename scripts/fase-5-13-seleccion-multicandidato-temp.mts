import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";
cargarEntornoDeFixturesYVerificar();
const { prisma } = await import("../../src/lib/prisma.ts");
const ambiguos = await prisma.shadowMatchLog.findMany({
  where: { status: "AMBIGUOUS" },
  select: { paymentTransactionId: true, status: true, score: true, topCandidates: true },
});
console.log(`AMBIGUOUS reales en ShadowMatchLog: ${ambiguos.length}`);
console.log(ambiguos);
const yaEvaluados = new Set((await prisma.paymentEvidenceAssessmentLog.findMany({ select: { paymentTransactionId: true } })).map(f=>f.paymentTransactionId));
console.log("Ya tienen PaymentEvidenceAssessmentLog:", ambiguos.filter(a=>yaEvaluados.has(a.paymentTransactionId)).map(a=>a.paymentTransactionId));
console.log("SIN evaluar todavía:", ambiguos.filter(a=>!yaEvaluados.has(a.paymentTransactionId)).map(a=>a.paymentTransactionId));
await prisma.$disconnect();
