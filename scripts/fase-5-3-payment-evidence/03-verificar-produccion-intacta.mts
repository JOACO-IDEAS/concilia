// Fase 5.3 — verificación de PRODUCCIÓN, exclusivamente de LECTURA.
// Este script NUNCA escribe: solo cuenta filas. Sirve para confirmar que
// ninguna tabla de producción cambió como efecto de este trabajo (que de
// todos modos corrió 100% contra dev-fixtures — esto es solo una confirmación
// adicional de higiene, no porque se sospeche un cambio).
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

cargarArchivoEnv(".env.local");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("No hay DATABASE_URL tras cargar .env.local.");
const host = new URL(databaseUrl).host;
if (!host.includes(PRODUCTION_HOST_FRAGMENT)) {
  throw new Error(`Este script espera apuntar a producción (host debía contener "${PRODUCTION_HOST_FRAGMENT}"), pero DATABASE_URL apunta a "${host}".`);
}
console.log(`[verificar-produccion-intacta] Conectando SOLO LECTURA a producción (${host}).`);

const { prisma } = await import("../../src/lib/prisma.ts");

async function contarSeguro(nombre: string, fn: () => Promise<number>) {
  try {
    const n = await fn();
    console.log(`${nombre}: ${n}`);
  } catch (e) {
    console.log(`${nombre}: ERROR (${e instanceof Error ? e.message.split("\n")[0] : e})`);
  }
}

await contarSeguro("organization", () => prisma.organization.count());
await contarSeguro("unit", () => prisma.unit.count());
await contarSeguro("unitOwner", () => prisma.unitOwner.count());
await contarSeguro("obligation", () => prisma.obligation.count());
await contarSeguro("paymentTransaction", () => prisma.paymentTransaction.count());
await contarSeguro("reconciliationMatch", () => prisma.reconciliationMatch.count());
await contarSeguro("paymentNotice", () => prisma.paymentNotice.count());
await contarSeguro("shadowMatchLog", () => prisma.shadowMatchLog.count());
await contarSeguro("agentObservation", () => prisma.agentObservation.count());

console.log("\n[verificar-produccion-intacta] Fin — solo lectura, cero escrituras.");
await prisma.$disconnect();
