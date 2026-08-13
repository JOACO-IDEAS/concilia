// Fase 5.13 — búsqueda SOLO LECTURA de un PaymentTransaction real de
// dev-fixtures cuyo motor bancario real (ShadowMatchLog) ya lo evaluó como
// AMBIGUOUS (varios candidatos, sin ganador claro). Ninguna escritura.

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[Fase 5.13 — buscar caso ambiguo] Corriendo sobre dev-fixtures (${info.host}), SOLO LECTURA.\n`);

const { prisma } = await import("../../src/lib/prisma.ts");

const ambiguos = await prisma.shadowMatchLog.findMany({
  where: { status: "AMBIGUOUS" },
  select: { paymentTransactionId: true, status: true, score: true, topCandidates: true },
});
console.log(`AMBIGUOUS reales en ShadowMatchLog: ${ambiguos.length}`);
console.log(ambiguos);

const yaEvaluados = new Set((await prisma.paymentEvidenceAssessmentLog.findMany({ select: { paymentTransactionId: true } })).map((f) => f.paymentTransactionId));
console.log("\nYa tienen PaymentEvidenceAssessmentLog:", ambiguos.filter((a) => yaEvaluados.has(a.paymentTransactionId)).map((a) => a.paymentTransactionId));
console.log("SIN evaluar todavía por evidence-score-runner:", ambiguos.filter((a) => !yaEvaluados.has(a.paymentTransactionId)).map((a) => a.paymentTransactionId));

await prisma.$disconnect();
