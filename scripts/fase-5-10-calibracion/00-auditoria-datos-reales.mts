// Fase 5.10 — auditoría OBLIGATORIA de datos reales antes de implementar
// nada. 100% SOLO LECTURA contra dev-fixtures. Nunca contra producción
// (producción se audita aparte, con el script ya establecido de solo
// lectura).
import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[auditoria-5-10] Conectando SOLO LECTURA a dev-fixtures (${info.host}).`);
console.log("=".repeat(80));

const { prisma } = await import("../../src/lib/prisma.ts");
const { Prisma } = await import("../../src/generated/prisma/client.ts");

console.log("\n### ReconciliationMatch — total y por decisión ###");
const totalRM = await prisma.reconciliationMatch.count();
const porDecision = await prisma.reconciliationMatch.groupBy({ by: ["decision"], _count: { _all: true } });
console.log(`Total: ${totalRM}`);
console.table(porDecision.map((d) => ({ decision: d.decision, cantidad: d._count._all })));

console.log("\n### ReconciliationMatch — filas completas (son pocas, mostrar todo) ###");
const filasRM = await prisma.reconciliationMatch.findMany({
  select: { id: true, paymentTransactionId: true, unitId: true, obligationId: true, decision: true, score: true, reason: true, rejectionReason: true, createdAt: true },
  orderBy: { createdAt: "asc" },
});
console.table(filasRM);

console.log("\n### PaymentEvidenceAssessmentLog — total, por state, con/sin structuredEvidence ###");
const totalPEAL = await prisma.paymentEvidenceAssessmentLog.count();
const porState = await prisma.paymentEvidenceAssessmentLog.groupBy({ by: ["state"], _count: { _all: true } });
const conStructured = await prisma.paymentEvidenceAssessmentLog.count({ where: { NOT: { structuredEvidence: { equals: Prisma.DbNull } } } });
console.log(`Total: ${totalPEAL}`);
console.table(porState.map((s) => ({ state: s.state, cantidad: s._count._all })));
console.log(`Con structuredEvidence no-null: ${conStructured} / ${totalPEAL}`);

console.log("\n### PaymentEvidenceAssessmentLog — engineVersion distintas ###");
const versionesPEAL = await prisma.paymentEvidenceAssessmentLog.groupBy({ by: ["engineVersion"], _count: { _all: true } });
console.table(versionesPEAL.map((v) => ({ engineVersion: v.engineVersion, cantidad: v._count._all })));

console.log("\n### ShadowMatchLog — engineVersion distintas ###");
const versionesSML = await prisma.shadowMatchLog.groupBy({ by: ["engineVersion"], _count: { _all: true } });
console.table(versionesSML.map((v) => ({ engineVersion: v.engineVersion, cantidad: v._count._all })));

console.log("\n### Relación ReconciliationMatch <-> PaymentEvidenceAssessmentLog (por paymentTransactionId) ###");
for (const rm of filasRM) {
  const evaluaciones = await prisma.paymentEvidenceAssessmentLog.findMany({
    where: { paymentTransactionId: rm.paymentTransactionId },
    select: { id: true, state: true, candidateUnitId: true, engineVersion: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\nReconciliationMatch ${rm.id} (decision=${rm.decision}, unitId=${rm.unitId}, paymentTransactionId=${rm.paymentTransactionId}):`);
  if (evaluaciones.length === 0) {
    console.log("  -> NINGUNA PaymentEvidenceAssessmentLog para este paymentTransactionId. Sin evidencia de motor para comparar.");
  } else {
    for (const ev of evaluaciones) {
      const unidadCoincide = ev.candidateUnitId === rm.unitId;
      console.log(`  -> PEAL ${ev.id}: state=${ev.state}, candidateUnitId=${ev.candidateUnitId} ${unidadCoincide ? "(COINCIDE con RM.unitId)" : "(NO coincide con RM.unitId)"}`);
    }
  }
}

console.log("\n### Los 10 PaymentTransaction con organización con unidades (ya identificados en Fase 5.9.1) — ¿tienen evidencia y/o decisión? ###");
const idsConocidos = [
  "cmskomn6m0000x91kcrtgb8cd",
  "cmskomnmg0001x91k4tje0x4j",
  "cmskomo0i0002x91kbsxkopp1",
  "cmskomofx0003x91kq2hspus6",
  "cmskomout0004x91krf5zxpuk",
  "cmskompa30005x91knsx1mo94",
  "cmskompp20006x91k9eu1k5dk",
  "cmskomq4g0007x91kxzrroqv9",
  "cmskomqir0008x91k3fhwada4",
  "cmskomqy40009x91kbvhr0wvy",
];
for (const id of idsConocidos) {
  const evals = await prisma.paymentEvidenceAssessmentLog.count({ where: { paymentTransactionId: id } });
  const rms = await prisma.reconciliationMatch.count({ where: { paymentTransactionId: id } });
  console.log(`${id}: PaymentEvidenceAssessmentLog=${evals}, ReconciliationMatch=${rms}`);
}

await prisma.$disconnect();
console.log("\n[auditoria-5-10] Fin — 100% solo lectura.");
