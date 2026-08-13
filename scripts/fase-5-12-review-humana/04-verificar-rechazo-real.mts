// Fase 5.12 — verificación end-to-end, 100% SOLO LECTURA, del RECHAZO real
// tomado desde /conciliacion/revision-humana (dev-fixtures) por el usuario
// sobre UF 2B ([FIXTURE] Consorcio Beta). Mismo criterio que
// 02-verificar-decision-real.mts (caso APPROVED) — ninguna escritura acá.

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[Fase 5.12 — verificación RECHAZO real] Corriendo sobre dev-fixtures (${info.host}), SOLO LECTURA.\n`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { inferirProvenanceDeDecision } = await import("../../src/lib/calibration/decision-provenance.ts");
const { cargarDatasetDeCalibracionReal } = await import("../../src/lib/calibration/loader.ts");
const { calcularMetricasDeCalibracion } = await import("../../src/lib/calibration/metrics.ts");

const PAGO_RECHAZADO = "cmskomo0i0002x91kbsxkopp1"; // UF 2B
const UNIDAD_RECHAZADA = "cmskohfpi000sgg1kcamf9swx";
const PAGO_APROBADO_ANTERIOR = "cmskompp20006x91k9eu1k5dk"; // UF 4A, prueba APPROVED previa
const UNIDAD_APROBADA_ANTERIOR = "cmskohla50015gg1kofmi7svr";

console.log("=== 1/2/3. Fila ReconciliationMatch del rechazo ===");
const rechazo = await prisma.reconciliationMatch.findFirst({
  where: { paymentTransactionId: PAGO_RECHAZADO, unitId: UNIDAD_RECHAZADA },
  orderBy: { createdAt: "desc" },
});

if (!rechazo) {
  console.log("⚠ No se encontró ninguna ReconciliationMatch para UF 2B — el rechazo no quedó registrado. DETENIDO.");
  await prisma.$disconnect();
  process.exit(1);
}

console.log({
  id: rechazo.id,
  paymentTransactionId: rechazo.paymentTransactionId,
  unitId: rechazo.unitId,
  decision: rechazo.decision,
  score: rechazo.score,
  createdAt: rechazo.createdAt.toISOString(),
});
console.log(`reason: "${rechazo.reason}"`);
console.log(`rejectionReason: "${rechazo.rejectionReason}"`);

console.log(`\n1. decision === "REJECTED": ${rechazo.decision === "REJECTED" ? "✓ SÍ" : "✗ NO — " + rechazo.decision}`);
console.log(`2. rejectionReason contiene el marcador Y el motivo real intacto (sin truncar): ver texto completo arriba.`);
console.log(`   Motivo real, sin el marcador: "${(rechazo.rejectionReason ?? "").replace("[SYNTHETIC_DEMO] ", "")}"`);
console.log(`3. reason contiene "[SYNTHETIC_DEMO]": ${rechazo.reason.includes("[SYNTHETIC_DEMO]") ? "✓ SÍ" : "✗ NO"}`);

console.log("\n=== 4. Provenance ===");
const provenance = inferirProvenanceDeDecision(rechazo.reason, rechazo.rejectionReason);
console.log(`inferirProvenanceDeDecision(reason, rejectionReason) = ${provenance}`);
console.log(provenance === "SYNTHETIC_DEMO" ? "✓ Correcto — nunca ORGANIC." : `✗ INCORRECTO — se esperaba SYNTHETIC_DEMO, se obtuvo ${provenance}.`);

console.log("\n=== 5. CalibrationCase correspondiente ===");
const dataset = await cargarDatasetDeCalibracionReal();
const casoRechazado = dataset.find((c) => c.paymentTransactionId === PAGO_RECHAZADO && c.candidateUnitId === UNIDAD_RECHAZADA && c.humanDecisionSourceId === rechazo.id);

if (!casoRechazado) {
  console.log("⚠ No se encontró el CalibrationCase vinculado a este humanDecisionSourceId. Casos del mismo pago:");
  console.log(dataset.filter((c) => c.paymentTransactionId === PAGO_RECHAZADO).map((c) => ({ groundTruth: c.groundTruth, provenance: c.humanDecisionProvenance, sourceId: c.humanDecisionSourceId })));
} else {
  console.log({ groundTruth: casoRechazado.groundTruth, humanDecision: casoRechazado.humanDecision, humanDecisionProvenance: casoRechazado.humanDecisionProvenance });
  const groundTruthReal = casoRechazado.groundTruth;
  const esperadoPorElUsuario = "HUMAN_CONFIRMED";
  console.log(`\nValor REAL de groundTruth: "${groundTruthReal}".`);
  if (groundTruthReal !== esperadoPorElUsuario) {
    console.log(
      `⚠ DISCREPANCIA CON LO PEDIDO: el punto 5 del pedido dice groundTruth=HUMAN_CONFIRMED para este caso, pero el valor real (correcto, dado que la decisión fue REJECTED) es "${groundTruthReal}". No se corrige nada automáticamente — se reporta tal cual, ver informe.`
    );
  }
  console.log(`humanDecisionProvenance: "${casoRechazado.humanDecisionProvenance}" — ${casoRechazado.humanDecisionProvenance === "SYNTHETIC_DEMO" ? "✓ correcto" : "✗ incorrecto"}.`);
}

console.log("\n=== 6/7. Agregado ORGANIC + contribución al pipeline ===");
const metricas = calcularMetricasDeCalibracion(dataset);
const organicos = dataset.filter((c) => c.humanDecisionProvenance === "ORGANIC").length;
const sinteticos = dataset.filter((c) => c.humanDecisionProvenance === "SYNTHETIC_DEMO").length;
console.log(`totalCasos=${metricas.totalCasos}, casosConDecisionHumana=${metricas.casosConDecisionHumana}`);
console.log(`Casos ORGANIC en todo el dataset: ${organicos} (debe ser 0) — ${organicos === 0 ? "✓ correcto" : "✗ INCORRECTO"}`);
console.log(`Casos SYNTHETIC_DEMO en todo el dataset: ${sinteticos} (incluye APPROVED anterior + este REJECTED)`);
console.log(`Matriz de confusión: ${JSON.stringify(metricas.matrizDeConfusion)} — este caso entra como FP/FN/TN/TP solo dentro del conteo total, nunca separado de sintéticos en ninguna métrica de confianza (ver recommendation.ts, Fase 5.11 — confianza calculada solo sobre organic).`);

console.log("\n=== 8. Ambas decisiones (APPROVED anterior + REJECTED nueva) diferenciadas y auditables ===");
const aprobadoAnterior = await prisma.reconciliationMatch.findFirst({
  where: { paymentTransactionId: PAGO_APROBADO_ANTERIOR, unitId: UNIDAD_APROBADA_ANTERIOR },
  orderBy: { createdAt: "desc" },
});
if (!aprobadoAnterior) {
  console.log("⚠ La decisión APPROVED de la prueba anterior ya no se encuentra — no debería poder pasar (append-only).");
} else {
  console.log("APPROVED anterior (sin modificar):", { id: aprobadoAnterior.id, decision: aprobadoAnterior.decision, paymentTransactionId: aprobadoAnterior.paymentTransactionId, unitId: aprobadoAnterior.unitId, createdAt: aprobadoAnterior.createdAt.toISOString() });
  console.log("REJECTED nueva:", { id: rechazo.id, decision: rechazo.decision, paymentTransactionId: rechazo.paymentTransactionId, unitId: rechazo.unitId, createdAt: rechazo.createdAt.toISOString() });
  const diferenciadas = aprobadoAnterior.id !== rechazo.id && aprobadoAnterior.decision === "APPROVED" && rechazo.decision === "REJECTED" && aprobadoAnterior.paymentTransactionId !== rechazo.paymentTransactionId;
  console.log(diferenciadas ? "✓ Ambas filas son distintas, cada una con su propia decisión, pago y unidad — completamente diferenciables y auditables por separado." : "✗ Algo no está diferenciado correctamente.");
}

console.log("\n=== Conteo total de escrituras desde la prueba APPROVED ===");
const totalReconciliationMatch = await prisma.reconciliationMatch.count();
const totalPaymentEvidence = await prisma.paymentEvidenceAssessmentLog.count();
console.log(`ReconciliationMatch total ahora: ${totalReconciliationMatch} (5 antes de este rechazo + 1 = 6 esperado).`);
console.log(`PaymentEvidenceAssessmentLog total ahora: ${totalPaymentEvidence} (sin cambios esperados respecto a después de generar el caso fresco — este script no genera nada).`);

await prisma.$disconnect();
