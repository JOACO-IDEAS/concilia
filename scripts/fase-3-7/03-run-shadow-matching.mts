// Fase 3.7 — Parte 6: corre el motor shadow ÚNICAMENTE sobre los 10
// PaymentTransaction de esta fase (prefijo "seed-fase37:"), nunca sobre los
// 40 reales preexistentes en esta rama (esos siguen preservados intactos,
// tal como se decidió en Fase 3.6 Parte 3 — diferida, no ejecutada).
//
// Reutiliza `ejecutarMatchingEnSombra` (Fase 3.4/3.5) sin ningún cambio —
// el único store real hoy es `PrismaShadowResultStore`, que solo escribe
// `ShadowMatchLog` (ver shadow-store.ts). Antes y después de correr, se
// cuentan todas las demás tablas relevantes para confirmar que ninguna
// cambió.

import { cargarEntornoDeFixturesYVerificar } from "./lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[shadow-matching] Corriendo sobre dev-fixtures (${info.host}).`);

const { PREFIJO_EXTERNAL_ID, ESCENARIOS } = await import("./fixtures-data.mts");
const { prisma } = await import("../../src/lib/prisma.ts");
const { ejecutarMatchingEnSombra } = await import("../../src/lib/reconciliation/shadow-runner.ts");

const pagos = await prisma.paymentTransaction.findMany({
  where: { externalId: { startsWith: PREFIJO_EXTERNAL_ID } },
  select: { id: true, externalId: true, organizationId: true, organization: { select: { name: true } } },
  orderBy: { externalId: "asc" },
});

console.log(`\n=== Pagos que se van a evaluar (${pagos.length}) ===`);
for (const p of pagos) {
  const escenarioId = p.externalId.replace(PREFIJO_EXTERNAL_ID, "");
  const escenario = ESCENARIOS.find((e) => e.id === escenarioId);
  console.log(
    `  ${p.id}  externalId=${p.externalId}  org="${p.organization?.name ?? "(sin resolver)"}"  escenario="${escenario?.descripcion ?? "?"}"`
  );
}

async function contarTablasNoTocables() {
  const [tx, unit, unitOwner, obligation, match, notice] = await Promise.all([
    prisma.paymentTransaction.count(),
    prisma.unit.count(),
    prisma.unitOwner.count(),
    prisma.obligation.count(),
    prisma.reconciliationMatch.count(),
    prisma.paymentNotice.count(),
  ]);
  return { tx, unit, unitOwner, obligation, match, notice };
}

const antes = await contarTablasNoTocables();
const shadowAntes = await prisma.shadowMatchLog.count();

console.log(`\n=== Ejecutando ejecutarMatchingEnSombra() para cada uno (engineVersion actual) ===`);
for (const p of pagos) {
  await ejecutarMatchingEnSombra(p.id);
  console.log(`  ✓ ${p.externalId}`);
}

const despues = await contarTablasNoTocables();
const shadowDespues = await prisma.shadowMatchLog.count();

console.log("\n=== Verificación: solo ShadowMatchLog debería haber cambiado ===");
console.table({
  PaymentTransaction: { antes: antes.tx, despues: despues.tx },
  Unit: { antes: antes.unit, despues: despues.unit },
  UnitOwner: { antes: antes.unitOwner, despues: despues.unitOwner },
  Obligation: { antes: antes.obligation, despues: despues.obligation },
  ReconciliationMatch: { antes: antes.match, despues: despues.match },
  PaymentNotice: { antes: antes.notice, despues: despues.notice },
  ShadowMatchLog: { antes: shadowAntes, despues: shadowDespues },
});

const cambiosInesperados =
  antes.tx !== despues.tx ||
  antes.unit !== despues.unit ||
  antes.unitOwner !== despues.unitOwner ||
  antes.obligation !== despues.obligation ||
  antes.match !== despues.match ||
  antes.notice !== despues.notice;

if (cambiosInesperados) {
  throw new Error("¡ALERTA! Alguna tabla que debía permanecer intacta cambió — ver tabla arriba.");
}
console.log(
  cambiosInesperados
    ? "FALLÓ"
    : `OK — únicamente ShadowMatchLog cambió (${shadowAntes} → ${shadowDespues}).`
);

await prisma.$disconnect();
