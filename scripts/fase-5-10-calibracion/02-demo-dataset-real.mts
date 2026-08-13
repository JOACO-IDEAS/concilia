// Fase 5.10 — corre el pipeline de calibración COMPLETO (loader → dataset →
// métricas → matriz de confusión → desacuerdos → patrones → simulación de
// thresholds) contra los datos REALES de dev-fixtures, después de que
// 01-registrar-decisiones-demo.mts produjo al menos 2 casos de ground truth
// genuinamente vinculados. 100% SOLO LECTURA — no escribe nada.

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[Fase 5.10 — demo dataset real] Corriendo sobre dev-fixtures (${info.host}).\n`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { cargarDatasetDeCalibracionReal } = await import("../../src/lib/calibration/loader.ts");
const { calcularMetricasDeCalibracion } = await import("../../src/lib/calibration/metrics.ts");
const { analizarDesacuerdos, resumirCausas } = await import("../../src/lib/calibration/disagreement.ts");
const { minarPatrones, filtrarPatronesConfiables } = await import("../../src/lib/calibration/pattern-mining.ts");
const { simularUmbralesDeScore, simularMargenAmbiguedad } = await import("../../src/lib/calibration/threshold-simulation.ts");

const casos = await cargarDatasetDeCalibracionReal();

console.log(`=== Dataset de calibración — ${casos.length} caso(s) real(es) ===`);
console.table(
  casos.map((c) => ({
    paymentTransactionId: c.paymentTransactionId,
    candidateUnitId: c.candidateUnitId,
    engineState: c.engineState,
    engineScore: c.engineScore,
    tier: c.tier,
    groundTruth: c.groundTruth,
    humanDecision: c.humanDecision,
  }))
);

const metricas = calcularMetricasDeCalibracion(casos);
console.log("\n=== Métricas descriptivas ===");
console.log(JSON.stringify(metricas, null, 2));

const desacuerdos = analizarDesacuerdos(casos);
console.log(`\n=== Desacuerdos (MOTOR≠HUMANO): ${desacuerdos.length} ===`);
for (const d of desacuerdos) {
  console.log(`- ${d.caso.paymentTransactionId} [${d.categoria}] causa=${d.causa} — ${d.detalle}`);
}
console.log("Resumen de causas:", resumirCausas(desacuerdos));

const patrones = minarPatrones(casos, 5);
const patronesConfiables = filtrarPatronesConfiables(patrones);
console.log(`\n=== Patrones minados: ${patrones.length} totales, ${patronesConfiables.length} confiables (muestra>=5) ===`);
for (const p of patrones) {
  console.log(`- [${p.tipo}] ${p.descripcion} (confiable=${p.confiable})`);
}

const simulacionScore = simularUmbralesDeScore(casos, [80, 85, 90]);
console.log("\n=== Simulación what-if — umbral de score ===");
console.table(simulacionScore.map((s) => ({ umbral: s.umbral, casosEvaluables: s.casosEvaluables, ...s.matrizSimulada, cambios: s.cambiosDeCategoria.length })));

const simulacionMargen = simularMargenAmbiguedad(casos, [5, 10, 15, 20]);
console.log("\n=== Simulación what-if — MARGEN_AMBIGUEDAD ===");
console.table(simulacionMargen.map((s) => ({ margen: s.margen, casosAplicables: s.casosAplicables, pasanASerAmbiguos: s.casosQuePasanASerAmbiguos, dejanDeSerAmbiguos: s.casosQueDejanDeSerAmbiguos })));

console.log(
  `\n=== Resumen honesto ===\nTotal casos evaluables: ${metricas.totalCasos}. Con decisión humana real: ${metricas.casosConDecisionHumana}. Sin decisión: ${metricas.casosSinDecision}. No vinculables: ${metricas.casosNoVinculables}.\nMatriz: TP=${metricas.matrizDeConfusion.TP} FP=${metricas.matrizDeConfusion.FP} FN=${metricas.matrizDeConfusion.FN} TN=${metricas.matrizDeConfusion.TN} NOT_CALIBRATABLE=${metricas.matrizDeConfusion.NOT_CALIBRATABLE}.\nMuestra total demasiado chica para cualquier conclusión estadística confiable — esto es INFRAESTRUCTURA DE VISIBILIDAD, no un veredicto de calidad del motor.`
);

await prisma.$disconnect();
