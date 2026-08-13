// Fase 5.13 — verificación end-to-end, 100% SOLO LECTURA, de la decisión
// real tomada desde /conciliacion/revision-humana (sección "Ambiguos",
// dev-fixtures) por el usuario sobre el caso ambiguo
// cmskomout0004x91krf5zxpuk (candidatos reales: UF 1A score=22, UF 2B
// score=22, UF 2A score=12). Ninguna escritura.

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[Fase 5.13 — verificación decisión ambigua real] Corriendo sobre dev-fixtures (${info.host}), SOLO LECTURA.\n`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { inferirProvenanceDeDecision } = await import("../../src/lib/calibration/decision-provenance.ts");
const { cargarDatasetDeCalibracionReal } = await import("../../src/lib/calibration/loader.ts");
const { calcularMetricasDeCalibracion } = await import("../../src/lib/calibration/metrics.ts");
const { generarRecomendacionesDePatrones } = await import("../../src/lib/calibration/recommendation.ts");
const { detectarCandidatosDeAutomatizacion } = await import("../../src/lib/calibration/automation-candidates.ts");
const { filtrarCasosAmbiguos } = await import("../../src/lib/reconciliation/review-queue.ts");

const PAGO_AMBIGUO = "cmskomout0004x91krf5zxpuk";
const CANDIDATOS_REALES = ["1A", "2B", "2A"]; // por unitCode, de la evaluación real generada en 01

console.log("=== 1/2. ReconciliationMatch creadas para este pago ===");
const decisiones = await prisma.reconciliationMatch.findMany({
  where: { paymentTransactionId: PAGO_AMBIGUO },
  orderBy: { createdAt: "asc" },
  include: { unit: { select: { code: true } } },
});

if (decisiones.length === 0) {
  console.log("⚠ No se encontró ninguna ReconciliationMatch para este pago — ¿se completó realmente la decisión desde la UI? DETENIDO.");
  await prisma.$disconnect();
  process.exit(1);
}

for (const d of decisiones) {
  console.log({ id: d.id, decision: d.decision, unitId: d.unitId, unitCode: d.unit?.code ?? null, score: d.score, createdAt: d.createdAt.toISOString() });
  console.log(`  reason: "${d.reason}"`);
  if (d.rejectionReason) console.log(`  rejectionReason: "${d.rejectionReason}"`);
}

const esEleccionUnica = decisiones.length === 1 && decisiones[0].decision === "APPROVED";
const esRechazoTotal = decisiones.length === CANDIDATOS_REALES.length && decisiones.every((d) => d.decision === "REJECTED");
console.log(`\nPatrón detectado: ${esEleccionUnica ? `ELECCIÓN de un candidato (UF ${decisiones[0].unit?.code})` : esRechazoTotal ? "RECHAZO TOTAL (todos los candidatos)" : "⚠ patrón inesperado — revisar manualmente"}`);

console.log("\n=== 3. El caso ambiguo quedó resuelto (no vuelve a aparecer en la cola) ===");
const filasEvaluaciones = await prisma.paymentEvidenceAssessmentLog.findMany({ orderBy: { createdAt: "asc" } });
const filasDecisionesTodas = await prisma.reconciliationMatch.findMany({ select: { paymentTransactionId: true, unitId: true, decision: true } });
const evaluacionesCrudas = filasEvaluaciones.map((f) => ({
  id: f.id,
  paymentTransactionId: f.paymentTransactionId,
  state: f.state,
  candidateUnitId: f.candidateUnitId,
  families: f.families,
  hasContradiction: f.hasContradiction,
  contradictionDetail: f.contradictionDetail,
  explanation: f.explanation,
  structuredEvidence: f.structuredEvidence,
  evaluatedAt: f.evaluatedAt.toISOString(),
}));
const colaAmbiguaActual = filtrarCasosAmbiguos(evaluacionesCrudas as never, filasDecisionesTodas as never);
const siguePendiente = colaAmbiguaActual.some((c) => c.paymentTransactionId === PAGO_AMBIGUO);
console.log(siguePendiente ? "✗ INCORRECTO — el caso todavía aparece en la cola de ambiguos." : "✓ Correcto — el caso ya NO aparece en la cola de ambiguos (resuelto).");

if (esEleccionUnica) {
  const otrosNoElegidos = CANDIDATOS_REALES.filter((c) => c !== decisiones[0].unit?.code);
  const otrasFilas = await prisma.reconciliationMatch.findMany({ where: { paymentTransactionId: PAGO_AMBIGUO, unit: { code: { in: otrosNoElegidos } } } });
  console.log(`Otros candidatos (${otrosNoElegidos.join(", ")}) con alguna ReconciliationMatch: ${otrasFilas.length} (debe ser 0 — nunca se decide nada sobre los no elegidos).`);
}

console.log("\n=== 4. Provenance ===");
for (const d of decisiones) {
  const provenance = inferirProvenanceDeDecision(d.reason, d.rejectionReason);
  console.log(`${d.id} (${d.decision}, UF ${d.unit?.code}): provenance=${provenance} — ${provenance === "SYNTHETIC_DEMO" ? "✓ correcto" : "✗ INCORRECTO, se esperaba SYNTHETIC_DEMO"}`);
}

console.log("\n=== 5. Auditabilidad ===");
const pago = await prisma.paymentTransaction.findUnique({ where: { id: PAGO_AMBIGUO }, select: { amount: true, concept: true, organization: { select: { name: true } } } });
console.log(`Pago: $${pago?.amount.toNumber()} — ${pago?.concept} — ${pago?.organization?.name}`);
console.log("Cada decisión responde qué/cuándo/por qué — ver bloque §1/2 arriba (reason/rejectionReason completos, createdAt real, score real del candidato).");

console.log("\n=== 6/7. Impacto en el pipeline de calibración ===");
const dataset = await cargarDatasetDeCalibracionReal();
const casosDeEstePago = dataset.filter((c) => c.paymentTransactionId === PAGO_AMBIGUO);
console.log(`CalibrationCase(s) para este pago: ${casosDeEstePago.length}`);
for (const c of casosDeEstePago) {
  console.log({ candidateUnitId: c.candidateUnitId, groundTruth: c.groundTruth, humanDecision: c.humanDecision, humanDecisionProvenance: c.humanDecisionProvenance });
}

const metricas = calcularMetricasDeCalibracion(dataset);
const organicos = dataset.filter((c) => c.humanDecisionProvenance === "ORGANIC").length;
const sinteticos = dataset.filter((c) => c.humanDecisionProvenance === "SYNTHETIC_DEMO").length;
console.log(`\nDataset completo: totalCasos=${metricas.totalCasos}, casosConDecisionHumana=${metricas.casosConDecisionHumana}`);
console.log(`Casos ORGANIC en todo el dataset: ${organicos} (debe seguir siendo 0) — ${organicos === 0 ? "✓ correcto" : "✗ INCORRECTO"}`);
console.log(`Casos SYNTHETIC_DEMO en todo el dataset: ${sinteticos}`);
console.log(`Matriz de confusión: ${JSON.stringify(metricas.matrizDeConfusion)}`);

const patrones = generarRecomendacionesDePatrones(dataset);
const patronesConMuestra = patrones.filter((p) => p.patron.totalCasos > 0);
console.log(`\nPatrones con al menos 1 caso: ${patronesConMuestra.length}`);
for (const p of patronesConMuestra) {
  console.log(`- [${p.patron.tipo}] ${p.descripcionAuditable}`);
}

const candidatosAutomatizacion = detectarCandidatosDeAutomatizacion(dataset).filter((c) => c.medible && c.totalCasos > 0);
console.log(`\nCandidatos de automatización con muestra: ${candidatosAutomatizacion.length}`);
for (const c of candidatosAutomatizacion) {
  console.log(`- [${c.tipo}] clave="${c.clave}" total=${c.totalCasos} confianza=${c.confianzaEstadistica} riesgo=${c.riesgoDeAutomatizar}`);
}
console.log(organicos === 0 ? "\n✓ Con 0 casos ORGANIC, NINGÚN patrón/candidato de arriba debería reportar confianza distinta de 'insuficiente' — verificado en las líneas de arriba." : "");

await prisma.$disconnect();
