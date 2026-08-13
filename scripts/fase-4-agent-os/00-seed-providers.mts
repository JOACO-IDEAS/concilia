// Fase 4 Parte D — siembra fixtures de Provider/ProviderOrganization/
// ProviderDocument ÚNICAMENTE en dev-fixtures, para poder demostrar el
// Agente de Control Operativo con datos reales de prueba (producción sigue
// en cero, intocada — ver informe). Todo claramente marcado [FIXTURE],
// mismo criterio que los consorcios de Fase 3.7. Idempotente: upsert por
// clave natural (taxId del proveedor).

import { cargarEntornoDeFixturesYVerificar } from "../fase-3-7/lib/fixtures-env.mts";

const info = cargarEntornoDeFixturesYVerificar();
console.log(`[seed-providers] Escribiendo en dev-fixtures (${info.host}).`);

const { prisma } = await import("../../src/lib/prisma.ts");

const organizaciones = await prisma.organization.findMany({
  where: { name: { startsWith: "[FIXTURE]" } },
  select: { id: true, name: true },
});
const orgIdPorNombre = new Map(organizaciones.map((o) => [o.name, o.id]));
const alfa = orgIdPorNombre.get("[FIXTURE] Consorcio Alfa");
const beta = orgIdPorNombre.get("[FIXTURE] Consorcio Beta");
const gamma = orgIdPorNombre.get("[FIXTURE] Consorcio Gamma");

if (!alfa || !beta || !gamma) {
  throw new Error(
    "No se encontraron los consorcios [FIXTURE] de Fase 3.7 en dev-fixtures — correr scripts/fase-3-7/01-seed-padron.mts primero."
  );
}

async function upsertProveedor(datos: { name: string; taxId: string; matricula?: string }) {
  return prisma.provider.upsert({
    where: { taxId: datos.taxId },
    update: { name: datos.name, matricula: datos.matricula },
    create: datos,
  });
}

async function upsertVinculo(providerId: string, organizationId: string) {
  await prisma.providerOrganization.upsert({
    where: { providerId_organizationId: { providerId, organizationId } },
    update: { activo: true },
    create: { providerId, organizationId, activo: true },
  });
}

async function upsertDocumento(providerId: string, datos: {
  type: "ART" | "RC" | "MATRICULA" | "AFIP" | "ANSES" | "OTRO";
  organizationId?: string | null;
  validTo: Date | null;
  documentNumber?: string;
}) {
  // Sin clave natural única declarada en el schema para ProviderDocument —
  // dedup manual acá por (providerId, type, organizationId) para que el
  // script sea seguro de correr más de una vez.
  const existente = await prisma.providerDocument.findFirst({
    where: { providerId, type: datos.type, organizationId: datos.organizationId ?? null, deletedAt: null },
  });
  if (existente) {
    await prisma.providerDocument.update({
      where: { id: existente.id },
      data: { validTo: datos.validTo, documentNumber: datos.documentNumber, status: "ACTIVE" },
    });
    return existente.id;
  }
  const creado = await prisma.providerDocument.create({
    data: {
      providerId,
      type: datos.type,
      organizationId: datos.organizationId ?? null,
      validTo: datos.validTo,
      documentNumber: datos.documentNumber,
      status: "ACTIVE",
      issuedAt: new Date("2025-01-01"),
    },
  });
  return creado.id;
}

// --- Proveedor 1: ART vencida (caso CRITICAL) ---
const ascensores = await upsertProveedor({ name: "[FIXTURE] Ascensores Rápidos SA", taxId: "30-90000001-1" });
await upsertVinculo(ascensores.id, alfa);
await upsertDocumento(ascensores.id, { type: "ART", validTo: new Date("2026-01-01") }); // vencida
await upsertDocumento(ascensores.id, { type: "RC", organizationId: alfa, validTo: new Date("2027-01-01") }); // vigente

// --- Proveedor 2: documento próximo a vencer (caso WARNING), múltiples organizaciones ---
const seguros = await upsertProveedor({ name: "[FIXTURE] Seguros del Sur SRL", taxId: "30-90000002-1" });
await upsertVinculo(seguros.id, alfa);
await upsertVinculo(seguros.id, beta);
const enDiez = new Date();
enDiez.setDate(enDiez.getDate() + 10);
await upsertDocumento(seguros.id, { type: "AFIP", validTo: enDiez }); // vence en ~10 días

// --- Proveedor 3: sin ningún documento (caso WARNING) ---
const limpieza = await upsertProveedor({ name: "[FIXTURE] Limpieza Total SRL", taxId: "30-90000003-1" });
await upsertVinculo(limpieza.id, beta);
// deliberadamente sin ningún ProviderDocument

// --- Proveedor 4: matrícula sin vencimiento (caso limpio, no debe generar observación) ---
const matriculado = await upsertProveedor({ name: "[FIXTURE] Electricista Matriculado ABC", taxId: "30-90000004-1" });
await upsertVinculo(matriculado.id, gamma);
await upsertDocumento(matriculado.id, { type: "MATRICULA", validTo: null });

console.log("\n=== Resumen (conteo real en dev-fixtures) ===");
const [providerCount, providerOrgCount, providerDocCount] = await Promise.all([
  prisma.provider.count({ where: { name: { startsWith: "[FIXTURE]" } } }),
  prisma.providerOrganization.count(),
  prisma.providerDocument.count(),
]);
console.table({ "Provider [FIXTURE]": providerCount, ProviderOrganization: providerOrgCount, ProviderDocument: providerDocCount });

await prisma.$disconnect();
