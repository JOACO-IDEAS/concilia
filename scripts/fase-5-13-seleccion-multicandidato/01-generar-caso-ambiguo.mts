// Fase 5.13 — genera UNA evaluación real fresca (append-only) para el pago
// real AMBIGUOUS identificado en 00-buscar-caso-ambiguo.mts, corriendo el
// MISMO orquestador real que usan los call sites de producción
// (`ejecutarEvaluacionSombraCompleta`, evidence-score-runner.ts — no está en
// la lista de archivos protegidos). Nunca escribe ninguna decisión —
// ReconciliationMatch debe quedar en +0. Autorizado explícitamente por el
// usuario antes de correr.

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[Fase 5.13 — generar caso ambiguo] Corriendo sobre dev-fixtures (${info.host}).\n`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { ejecutarEvaluacionSombraCompleta } = await import("../../src/lib/payment-evidence/evidence-score-runner.ts");

const PAGO_AMBIGUO = "cmskomout0004x91krf5zxpuk";

const antesPEA = await prisma.paymentEvidenceAssessmentLog.count();
const antesMatch = await prisma.reconciliationMatch.count();

await ejecutarEvaluacionSombraCompleta(PAGO_AMBIGUO);

const nueva = await prisma.paymentEvidenceAssessmentLog.findFirst({
  where: { paymentTransactionId: PAGO_AMBIGUO },
  orderBy: { createdAt: "desc" },
});

console.log("=== Evaluación real generada ===");
console.log({ id: nueva?.id, state: nueva?.state, candidateUnitId: nueva?.candidateUnitId, hasContradiction: nueva?.hasContradiction });
console.log("topCandidates:", (nueva?.structuredEvidence as { bank?: { topCandidates?: unknown } } | null)?.bank?.topCandidates);

const despuesPEA = await prisma.paymentEvidenceAssessmentLog.count();
const despuesMatch = await prisma.reconciliationMatch.count();

console.log(`\nPaymentEvidenceAssessmentLog: ${antesPEA} → ${despuesPEA} (+${despuesPEA - antesPEA})`);
console.log(`ReconciliationMatch: ${antesMatch} → ${despuesMatch} (+${despuesMatch - antesMatch}, debe ser 0 — este script NUNCA registra una decisión)`);

if (despuesMatch !== antesMatch) throw new Error("¡ALERTA! Este script no debía escribir ninguna ReconciliationMatch.");
if (nueva?.state !== "NEEDS_DECISION" || nueva?.candidateUnitId !== null) {
  console.log("⚠ El estado real resultante no fue NEEDS_DECISION/sin candidato — puede que el motor real ya no encuentre ambigüedad para este pago (datos reales, no se fuerza nada).");
} else {
  console.log("\nListo. Levantá el servidor de desarrollo apuntando a dev-fixtures y entrá a /conciliacion/revision-humana — sección 'Ambiguos'.");
}

await prisma.$disconnect();
