// Fase 5.11 — corre el pipeline COMPLETO de recomendación de calibración
// (loader → dataset con humanDecisionProvenance → recommendation.ts →
// automation-candidates.ts) contra los datos REALES de dev-fixtures. 100%
// SOLO LECTURA — no escribe nada (no hace falta: los 4 casos reales de Fase
// 5.10, incluidos los 2 con ground truth SYNTHETIC_DEMO, ya alcanzan para
// demostrar el pipeline completo end-to-end; Regla Final de esta fase: no
// fabricar más datos para llenar el vacío de ground truth ORGANIC).

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[Fase 5.11 — demo recomendaciones reales] Corriendo sobre dev-fixtures (${info.host}).\n`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { cargarDatasetDeCalibracionReal } = await import("../../src/lib/calibration/loader.ts");
const { generarRecomendacionesDeCalibracion, compararConfiguraciones } = await import("../../src/lib/calibration/recommendation.ts");
const { detectarCandidatosDeAutomatizacion } = await import("../../src/lib/calibration/automation-candidates.ts");

const casos = await cargarDatasetDeCalibracionReal();

console.log(`=== Dataset — ${casos.length} caso(s) real(es) ===`);
console.table(
  casos.map((c) => ({
    paymentTransactionId: c.paymentTransactionId,
    groundTruth: c.groundTruth,
    humanDecisionProvenance: c.humanDecisionProvenance,
    engineState: c.engineState,
    engineScore: c.engineScore,
  }))
);

const organicos = casos.filter((c) => c.humanDecisionProvenance === "ORGANIC").length;
const sinteticos = casos.filter((c) => c.humanDecisionProvenance === "SYNTHETIC_DEMO").length;
console.log(`\nGround truth ORGANIC: ${organicos} | SYNTHETIC_DEMO: ${sinteticos}`);
if (organicos === 0) {
  console.log("⚠ CERO casos ORGANIC — ningún administrador real decidió nada todavía. Toda recomendación de acá abajo DEBE reportar confianza 'insuficiente'. Si no lo hace, es un bug.");
}

const recos = generarRecomendacionesDeCalibracion(casos);

console.log(`\n=== Recomendaciones de patrones: ${recos.patrones.length} ===`);
for (const r of recos.patrones) {
  if (r.patron.totalCasos === 0) continue;
  console.log(`- [${r.patron.tipo}] ${r.descripcionAuditable}`);
}

console.log(`\n=== Recomendaciones de umbral de score: ${recos.umbralesDeScore.length} ===`);
for (const r of recos.umbralesDeScore) {
  console.log(
    `- umbral=${r.valorPropuesto}: matrizAntes=${JSON.stringify(r.matrizAntes)} → simulada=${JSON.stringify(r.resultado.matrizSimulada)} | mejoras=${r.mejoras.length} regresiones=${r.regresiones.length} | organic=${r.origenDeMuestra.organic} synth=${r.origenDeMuestra.syntheticDemo} | confianza=${r.nivelDeConfianza}`
  );
}

console.log(`\n=== Recomendaciones de margen de ambigüedad: ${recos.margenesDeAmbiguedad.length} ===`);
for (const r of recos.margenesDeAmbiguedad) {
  console.log(
    `- margen=${r.valorPropuesto} (actual=${r.valorActual}): pasanASerAmbiguos=${r.resultado.casosQuePasanASerAmbiguos} dejanDeSerAmbiguos=${r.resultado.casosQueDejanDeSerAmbiguos} | organic=${r.origenDeMuestra.organic} | confianza=${r.nivelDeConfianza}`
  );
}

console.log("\n=== CURRENT CONFIG vs PROPOSED CONFIG (ejemplo: margen 20 + pesos alternativos) ===");
const comparacion = compararConfiguraciones(casos, { marginAmbiguedad: 20, puntosPorTier: { 1: 50, 2: 25, 3: 12, 4: 5 } });
console.log("actual:", comparacion.actual);
console.log("cambios propuestos:", comparacion.cambios);
console.log("impacto margen:", comparacion.margenAmbiguedad ? { casosAplicables: comparacion.margenAmbiguedad.resultado.casosAplicables, confianza: comparacion.margenAmbiguedad.nivelDeConfianza } : null);
console.log("impacto pesos:", comparacion.pesosPorTier ? { casosEvaluables: comparacion.pesosPorTier.resultado.casosEvaluables, confianza: comparacion.pesosPorTier.nivelDeConfianza, limitacion: comparacion.pesosPorTier.limitacion } : null);

console.log("\n=== Candidatos de automatización (detección, NUNCA aplicación) ===");
const candidatos = detectarCandidatosDeAutomatizacion(casos);
for (const c of candidatos) {
  if (!c.medible) {
    console.log(`- [${c.tipo}] NO MEDIBLE: ${c.razonNoMedible} → falta: ${c.datoAdicionalNecesario}`);
    continue;
  }
  if (c.totalCasos === 0) continue;
  console.log(`- [${c.tipo}] clave="${c.clave}" total=${c.totalCasos} concordantes=${c.decisionesConcordantes} excepciones=${c.excepciones} confianza=${c.confianzaEstadistica} riesgo=${c.riesgoDeAutomatizar}`);
}

console.log(
  `\n=== Resumen honesto ===\nOrganic=${organicos}, SyntheticDemo=${sinteticos}. Con 0 casos ORGANIC, TODA recomendación de esta corrida es infraestructura verificada, no una conclusión aplicable — ningún threshold/peso/patrón de acá arriba debe usarse para cambiar el comportamiento real del motor todavía.`
);

await prisma.$disconnect();
