import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";
cargarEntornoDeFixturesYVerificar();
const { cargarDatasetDeCalibracionReal } = await import("../../src/lib/calibration/loader.ts");
const { generarRecomendacionesDePatrones } = await import("../../src/lib/calibration/recommendation.ts");

const casos = await cargarDatasetDeCalibracionReal();
console.log("Total de casos:", casos.length);
console.log("Con decisión humana:", casos.filter(c => c.humanDecision !== null).length);
console.log("ORGANIC:", casos.filter(c => c.humanDecisionProvenance === "ORGANIC").length);
console.log("SYNTHETIC_DEMO:", casos.filter(c => c.humanDecisionProvenance === "SYNTHETIC_DEMO").length);
console.log("humanDecidedBy no-null:", casos.filter(c => c.humanDecidedBy !== null).length, "(esperado 0 — todas las decisiones de fixtures son anteriores al sistema real de auth)");

const recomendaciones = generarRecomendacionesDePatrones(casos);
console.log("Niveles de confianza de patrones:", recomendaciones.map(r => r.nivelDeConfianza));

const { prisma } = await import("../../src/lib/prisma.ts");
await prisma.$disconnect();
