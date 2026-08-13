// Fase 3.7 — Paso D: siembra los PaymentTransaction de los 10 escenarios.
// Nunca pasa por reconcilePayment/webhook/AI parser — control exacto y
// determinístico de cada campo (ver FASE_3_7_DATA_SEED_PLAN.md §3, Paso D).
// `organizationId` se asigna directo (ya resuelto a propósito, como si la
// Capa 1 ya hubiera corrido) — status=MATCHED/matchMethod=MANUAL refleja
// eso con honestidad, sin inventar un "AUTO" que no ocurrió.
//
// Idempotente: upsert por `externalId` (prefijo "seed-fase37:" + id de
// escenario) — correr de nuevo actualiza los campos, nunca duplica.

import { cargarEntornoDeFixturesYVerificar } from "./lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[seed-payments] Escribiendo en dev-fixtures (${info.host}).`);

const { ESCENARIOS, PREFIJO_EXTERNAL_ID } = await import("./fixtures-data.mts");
const { prisma } = await import("../../src/lib/prisma.ts");

let creados = 0;
let actualizados = 0;

for (const escenario of ESCENARIOS) {
  const organizacion = await prisma.organization.findUnique({
    where: { taxId: escenario.organizationTaxId },
    select: { id: true },
  });
  if (!organizacion) {
    throw new Error(
      `Escenario "${escenario.id}": no se encontró la organización taxId=${escenario.organizationTaxId} — ¿corriste 01-seed-padron.mts primero?`
    );
  }

  const externalId = `${PREFIJO_EXTERNAL_ID}${escenario.id}`;
  const data = {
    externalId,
    provider: "seed-fase37",
    organizationId: organizacion.id,
    amount: escenario.amount,
    currency: "ARS",
    payerIdentifier: escenario.payerIdentifier,
    concept: escenario.concept,
    status: "MATCHED" as const,
    matchedAt: new Date(),
    matchMethod: "MANUAL" as const,
    rawPayload: { source: "seed-fase37", scenario: escenario.id, descripcion: escenario.descripcion },
  };

  const existente = await prisma.paymentTransaction.findUnique({ where: { externalId }, select: { id: true } });
  if (existente) {
    await prisma.paymentTransaction.update({ where: { id: existente.id }, data });
    actualizados++;
    console.log(`  = ${escenario.id} — actualizado (${existente.id})`);
  } else {
    const creado = await prisma.paymentTransaction.create({ data });
    creados++;
    console.log(`  + ${escenario.id} — creado (${creado.id})`);
  }
}

console.log(`\nCreados: ${creados}, Actualizados: ${actualizados}, Total escenarios: ${ESCENARIOS.length}`);

const total = await prisma.paymentTransaction.count({ where: { externalId: { startsWith: PREFIJO_EXTERNAL_ID } } });
console.log(`PaymentTransaction con prefijo "${PREFIJO_EXTERNAL_ID}" en la base: ${total}`);

await prisma.$disconnect();
