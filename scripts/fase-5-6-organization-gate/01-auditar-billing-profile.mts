// Fase 5.6 — auditoría 100% de LECTURA de BillingProfile.bankAccountNumber.
// Nunca escribe, nunca corrige duplicados (aunque los encuentre) — solo
// documenta. Corre dos veces: una contra dev-fixtures, otra contra
// producción (ambas de solo lectura), según qué .env se cargue.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PRODUCTION_HOST_FRAGMENT = "ep-broad-unit-aw04mt2w";
const APP_ROOT = resolve(import.meta.dirname, "../../");

function cargarArchivoEnv(nombreArchivo: string): void {
  const texto = readFileSync(resolve(APP_ROOT, nombreArchivo), "utf8");
  for (const linea of texto.split("\n")) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const archivoEnv = process.argv[2] === "produccion" ? ".env.local" : ".env.fixtures.local";
cargarArchivoEnv(archivoEnv);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error(`No hay DATABASE_URL tras cargar ${archivoEnv}.`);
const host = new URL(databaseUrl).host;
const esProduccion = host.includes(PRODUCTION_HOST_FRAGMENT);
console.log(`[auditar-billing-profile] Solo LECTURA — ${esProduccion ? "PRODUCCIÓN" : "dev-fixtures"} (${host}).`);

const { prisma } = await import("../../src/lib/prisma.ts");

const total = await prisma.billingProfile.count();
const totalActivos = await prisma.billingProfile.count({ where: { deletedAt: null } });
const nulos = await prisma.billingProfile.count({ where: { bankAccountNumber: "" } });

const todos = await prisma.billingProfile.findMany({
  where: { deletedAt: null },
  select: { id: true, organizationId: true, bankAccountNumber: true, bankAccountType: true, isDefault: true },
});

const organizacionesQueLoUsan = new Set(todos.map((b) => b.organizationId)).size;

// Agrupa por bankAccountNumber para encontrar valores compartidos entre
// organizaciones DISTINTAS (una misma organización con 2 perfiles propios
// no es el riesgo que importa acá — el riesgo es cross-organización).
const porNumero = new Map<string, { organizationId: string; id: string }[]>();
for (const b of todos) {
  const arr = porNumero.get(b.bankAccountNumber) ?? [];
  arr.push({ organizationId: b.organizationId, id: b.id });
  porNumero.set(b.bankAccountNumber, arr);
}

const duplicadosCrossOrg: { bankAccountNumber: string; organizaciones: string[] }[] = [];
const duplicadosMismaOrg: { bankAccountNumber: string; organizationId: string; cantidad: number }[] = [];
for (const [numero, filas] of porNumero) {
  if (filas.length < 2) continue;
  const orgsUnicas = new Set(filas.map((f) => f.organizationId));
  if (orgsUnicas.size > 1) {
    duplicadosCrossOrg.push({ bankAccountNumber: numero, organizaciones: [...orgsUnicas] });
  } else if (filas.length > 1) {
    duplicadosMismaOrg.push({ bankAccountNumber: numero, organizationId: filas[0].organizationId, cantidad: filas.length });
  }
}

console.log(`\nTotal BillingProfile (todas): ${total}`);
console.log(`Total BillingProfile (activas, deletedAt=null): ${totalActivos}`);
console.log(`Con bankAccountNumber vacío (""): ${nulos}`);
console.log(`Organizaciones distintas que tienen al menos un BillingProfile: ${organizacionesQueLoUsan}`);
console.log(`\nValores de bankAccountNumber compartidos por >1 organización distinta (el riesgo real de @@unique global): ${duplicadosCrossOrg.length}`);
for (const d of duplicadosCrossOrg) {
  console.log(`  - "${d.bankAccountNumber}" → organizaciones: ${d.organizaciones.join(", ")}`);
}
console.log(`\nValores repetidos DENTRO de la misma organización (no bloquean un @@unique(organizationId, bankAccountNumber), sí bloquean uno global): ${duplicadosMismaOrg.length}`);
for (const d of duplicadosMismaOrg) {
  console.log(`  - org ${d.organizationId}: "${d.bankAccountNumber}" x${d.cantidad}`);
}

console.log(`\n¿Un @@unique GLOBAL simple sobre bankAccountNumber rompería una migración hoy? ${duplicadosCrossOrg.length > 0 || duplicadosMismaOrg.length > 0 ? "SÍ" : "NO"}`);

await prisma.$disconnect();
