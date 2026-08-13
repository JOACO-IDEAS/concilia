// Fase 5.12 — verificación end-to-end, 100% SOLO LECTURA, de la decisión
// humana real tomada desde /conciliacion/revision-humana (dev-fixtures) por
// el usuario. Confirma: (1) la fila ReconciliationMatch real, (2) que
// decision-provenance.ts la clasifica SYNTHETIC_DEMO (nunca ORGANIC, por la
// guardia de entorno de esta fase), (3) que el motivo/auditabilidad quedan
// intactos, (4) que entra al pipeline de calibración con
// humanDecisionProvenance=SYNTHETIC_DEMO — nunca contaminando el conteo
// ORGANIC — y (5) que producción sigue intacta. Ninguna escritura.

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[Fase 5.12 — verificación real] Corriendo sobre dev-fixtures (${info.host}), SOLO LECTURA.\n`);

const { prisma } = await import("../../src/lib/prisma.ts");
const { inferirProvenanceDeDecision } = await import("../../src/lib/calibration/decision-provenance.ts");
const { cargarDatasetDeCalibracionReal } = await import("../../src/lib/calibration/loader.ts");
const { calcularMetricasDeCalibracion } = await import("../../src/lib/calibration/metrics.ts");
const { generarRecomendacionesDePatrones } = await import("../../src/lib/calibration/recommendation.ts");

// El caso fresco generado en el paso anterior de esta fase.
const PAYMENT_TRANSACTION_ID = "cmskompp20006x91k9eu1k5dk";
const CANDIDATE_UNIT_ID = "cmskohla50015gg1kofmi7svr";

console.log("=== 1. Fila ReconciliationMatch real ===");
const decision = await prisma.reconciliationMatch.findFirst({
  where: { paymentTransactionId: PAYMENT_TRANSACTION_ID, unitId: CANDIDATE_UNIT_ID },
  orderBy: { createdAt: "desc" },
});

if (!decision) {
  console.log("No se encontró ninguna ReconciliationMatch para este pago+unidad — nada que verificar. ¿Se aprobó/rechazó realmente?");
  await prisma.$disconnect();
  process.exit(1);
}

console.log({
  id: decision.id,
  paymentTransactionId: decision.paymentTransactionId,
  unitId: decision.unitId,
  obligationId: decision.obligationId,
  decision: decision.decision,
  score: decision.score,
  decidedBy: decision.decidedBy,
  createdAt: decision.createdAt.toISOString(),
});
console.log(`reason: "${decision.reason}"`);
console.log(`rejectionReason: ${decision.rejectionReason ? `"${decision.rejectionReason}"` : "null"}`);
console.log(`signals guardadas: ${Array.isArray(decision.signals) ? decision.signals.length : "—"}`);

console.log("\n=== 2. Clasificación de procedencia (decision-provenance.ts, Fase 5.11) ===");
const provenance = inferirProvenanceDeDecision(decision.reason, decision.rejectionReason);
console.log(`inferirProvenanceDeDecision(reason, rejectionReason) = ${provenance}`);
console.log(`¿Contiene el marcador [SYNTHETIC_DEMO]? ${decision.reason.includes("[SYNTHETIC_DEMO]") ? "SÍ" : "NO"}`);
if (provenance !== "SYNTHETIC_DEMO") {
  console.log("⚠ ALERTA: se esperaba SYNTHETIC_DEMO (decisión tomada sobre dev-fixtures) — la guardia de entorno no funcionó como se esperaba.");
} else {
  console.log("✓ Correcto: clasificada SYNTHETIC_DEMO — nunca contará como evidencia ORGANIC real, tal como pidió el usuario.");
}

console.log("\n=== 3. Auditabilidad — responde las preguntas pedidas ===");
const pago = await prisma.paymentTransaction.findUnique({ where: { id: decision.paymentTransactionId }, select: { amount: true, concept: true } });
const unidad = await prisma.unit.findUnique({ where: { id: decision.unitId ?? undefined }, select: { code: true, organization: { select: { name: true } } } });
console.log(`- Qué PaymentTransaction se revisó: ${decision.paymentTransactionId} (${pago ? `$${pago.amount.toNumber()} — ${pago.concept}` : "no encontrado"})`);
console.log(`- Qué candidato estaba siendo sugerido: ${decision.unitId} (UF ${unidad?.code ?? "?"}, ${unidad?.organization.name ?? "?"})`);
console.log(`- Qué score tenía: ${decision.score}`);
console.log(`- Qué decidió el administrador: ${decision.decision}`);
console.log(`- Cuándo: ${decision.createdAt.toISOString()}`);
console.log(`- Por qué: "${decision.reason}"${decision.rejectionReason ? ` / rechazo: "${decision.rejectionReason}"` : ""}`);
console.log(`- Provenance: ${provenance} (nunca ORGANIC en este entorno)`);

console.log("\n=== 4. Entra al pipeline de calibración sin contaminar ORGANIC ===");
const dataset = await cargarDatasetDeCalibracionReal();
const casoEnDataset = dataset.find((c) => c.paymentTransactionId === decision.paymentTransactionId && c.candidateUnitId === decision.unitId && c.humanDecisionSourceId === decision.id);

if (!casoEnDataset) {
  console.log("⚠ Este caso puntual NO aparece vinculado en el dataset con este humanDecisionSourceId — puede haber más de una evaluación para este pago (revisar manualmente el listado completo abajo).");
  console.log(
    dataset
      .filter((c) => c.paymentTransactionId === decision.paymentTransactionId)
      .map((c) => ({ groundTruth: c.groundTruth, humanDecisionProvenance: c.humanDecisionProvenance, humanDecisionSourceId: c.humanDecisionSourceId }))
  );
} else {
  console.log({
    groundTruth: casoEnDataset.groundTruth,
    humanDecision: casoEnDataset.humanDecision,
    humanDecisionProvenance: casoEnDataset.humanDecisionProvenance,
    origin: casoEnDataset.origin,
  });
  if (casoEnDataset.humanDecisionProvenance === "ORGANIC") {
    console.log("⚠ ALERTA: este caso quedó marcado ORGANIC en el dataset — NO debería, dado que la decisión es SYNTHETIC_DEMO.");
  } else {
    console.log("✓ Correcto: humanDecisionProvenance=SYNTHETIC_DEMO en el CalibrationCase — el pipeline de calibración lo reconoce como NO orgánico.");
  }
}

const metricas = calcularMetricasDeCalibracion(dataset);
console.log(`\nMétricas del dataset completo: totalCasos=${metricas.totalCasos}, casosConDecisionHumana=${metricas.casosConDecisionHumana}.`);

const casosOrganicos = dataset.filter((c) => c.humanDecisionProvenance === "ORGANIC").length;
const casosSinteticos = dataset.filter((c) => c.humanDecisionProvenance === "SYNTHETIC_DEMO").length;
console.log(`Casos ORGANIC en todo el dataset: ${casosOrganicos} (debe seguir siendo 0 — nunca hubo ninguna decisión real de producción).`);
console.log(`Casos SYNTHETIC_DEMO en todo el dataset: ${casosSinteticos} (incluye este nuevo caso).`);

const patrones = generarRecomendacionesDePatrones(dataset);
const patronConEsteCaso = patrones.find((p) => p.patron.casosIds.includes(decision.paymentTransactionId));
if (patronConEsteCaso) {
  console.log(`\nEste caso aparece en un patrón de recomendación con origenDeMuestra=${JSON.stringify(patronConEsteCaso.patron.origenDeMuestra)}, nivelDeConfianza=${patronConEsteCaso.nivelDeConfianza} (debe seguir siendo "insuficiente" — 0 organic).`);
}

console.log("\n=== 5. Verificación de producción (solo lectura) ===");
console.log("(ver script separado 03-verificar-produccion-intacta.mts de Fase 5.3 para la conexión real a producción)");

await prisma.$disconnect();
