import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";
cargarEntornoDeFixturesYVerificar();
const { cargarDatasetDeCalibracionReal } = await import("../../src/lib/calibration/loader.ts");

const casos = await cargarDatasetDeCalibracionReal();
console.log("Total de casos:", casos.length);
console.log("ORGANIC:", casos.filter(c => c.humanDecisionProvenance === "ORGANIC").length);
console.log("SYNTHETIC_DEMO:", casos.filter(c => c.humanDecisionProvenance === "SYNTHETIC_DEMO").length);

for (const c of casos.filter(c => c.humanDecision !== null)) {
  console.log({
    paymentTransactionId: c.paymentTransactionId,
    groundTruth: c.groundTruth,
    engineScore: c.engineScore,
    humanDecisionScore: c.humanDecisionScore,
  });
}

const { prisma } = await import("../../src/lib/prisma.ts");
await prisma.$disconnect();
