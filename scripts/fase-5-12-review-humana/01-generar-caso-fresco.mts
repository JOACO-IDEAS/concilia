// Fase 5.12 — genera UNA evaluación real fresca para que la cola de revisión
// humana (/conciliacion/revision-humana) tenga algo genuino para mostrar.
// Los 2 casos reales con candidato conocidos de fases anteriores YA tienen
// una decisión (Fase 5.10, demo), así que la cola está correctamente vacía
// hoy. Este script busca, entre los PaymentTransaction reales con
// organización-con-unidades (identificados en Fase 5.9.1), uno que:
//   (a) el motor bancario real ya evaluó como CANDIDATE (ShadowMatchLog),
//   (b) todavía NO tiene ninguna PaymentEvidenceAssessmentLog.
// y corre sobre él el MISMO orquestador real que usan los call sites de
// producción (`ejecutarEvaluacionSombraCompleta`, evidence-score-runner.ts —
// no está en la lista de archivos protegidos) — nunca fabrica una fila a
// mano, nunca inventa un candidateUnitId ni un score. Autorizado
// explícitamente por el usuario antes de correr.

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[Fase 5.12 — generar caso fresco] Corriendo sobre dev-fixtures (${info.host}).\n`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { ejecutarEvaluacionSombraCompleta } = await import("../../src/lib/payment-evidence/evidence-score-runner.ts");

const antesPEA = await prisma.paymentEvidenceAssessmentLog.count();
const antesMatch = await prisma.reconciliationMatch.count();

// Candidatos reales del motor bancario (ShadowMatchLog), status=CANDIDATE,
// que TODAVÍA no pasaron por evidence-score-runner.
const yaEvaluados = new Set((await prisma.paymentEvidenceAssessmentLog.findMany({ select: { paymentTransactionId: true } })).map((f) => f.paymentTransactionId));

const candidatosShadow = await prisma.shadowMatchLog.findMany({
  where: { status: "CANDIDATE" },
  select: { paymentTransactionId: true, candidateUnitId: true, score: true },
  orderBy: { score: "desc" },
});

const elegido = candidatosShadow.find((c) => !yaEvaluados.has(c.paymentTransactionId) && c.candidateUnitId);

if (!elegido) {
  console.log("No se encontró ningún PaymentTransaction real CANDIDATE sin evaluar todavía — nada para generar. Abortando sin escribir nada.");
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`Elegido: paymentTransactionId=${elegido.paymentTransactionId}, candidateUnitId real=${elegido.candidateUnitId}, score real=${elegido.score}`);

await ejecutarEvaluacionSombraCompleta(elegido.paymentTransactionId);

const nueva = await prisma.paymentEvidenceAssessmentLog.findFirst({
  where: { paymentTransactionId: elegido.paymentTransactionId },
  orderBy: { createdAt: "desc" },
});

console.log("\n=== Evaluación real generada ===");
console.log({ id: nueva?.id, state: nueva?.state, candidateUnitId: nueva?.candidateUnitId });

const despuesPEA = await prisma.paymentEvidenceAssessmentLog.count();
const despuesMatch = await prisma.reconciliationMatch.count();

console.log(`\nPaymentEvidenceAssessmentLog: ${antesPEA} → ${despuesPEA} (+${despuesPEA - antesPEA})`);
console.log(`ReconciliationMatch: ${antesMatch} → ${despuesMatch} (+${despuesMatch - antesMatch}, debe ser 0 — este script NUNCA registra una decisión)`);

if (despuesMatch !== antesMatch) throw new Error("¡ALERTA! Este script no debía escribir ninguna ReconciliationMatch.");

console.log("\nListo. Levantá el servidor de desarrollo apuntando a dev-fixtures y entrá a /conciliacion/revision-humana para revisar este caso real.");

await prisma.$disconnect();
