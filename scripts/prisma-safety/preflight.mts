// Safety hardening — post-incidente Fase 5.9. 100% SOLO LECTURA: nunca
// ejecuta migrate/db push/db execute, nunca INSERT/UPDATE/DELETE — solo
// SELECT. Corrido ANTES de cualquier migración real, muestra
// inequívocamente host/database/schema/entorno detectado/migraciones
// pendientes, y usa la MISMA función de verificación que la guardia
// automática de prisma.config.ts (src/lib/prisma-safety/entornos.ts) — una
// sola fuente de verdad, nunca dos implementaciones que puedan divergir.
//
// Uso obligatorio: --target=fixtures | --target=production (sin default —
// la ambigüedad aborta, nunca se adivina).
//
//   npx tsx scripts/prisma-safety/preflight.mts --target=fixtures
//   npx tsx scripts/prisma-safety/preflight.mts --target=production

import { resolve } from "node:path";
import { resolverDatasourceUrlDesdeEnv, verificarEntornoContraTarget } from "../../src/lib/prisma-safety/entornos.ts";
import { cargarVariablesEnvAisladas } from "../../src/lib/prisma-safety/env-file.ts";
import { ejecutarPreflightReadOnly } from "./preflight-core.mts";

const APP_ROOT = resolve(import.meta.dirname, "../..");

function cargarArchivoEnv(nombreArchivo: string): NodeJS.ProcessEnv {
  try {
    return cargarVariablesEnvAisladas(resolve(APP_ROOT, nombreArchivo));
  } catch {
    console.error(`[preflight] No se pudo leer ${nombreArchivo} — abortando.`);
    process.exit(1);
  }
}

const argTarget = process.argv.find((a) => a.startsWith("--target="))?.slice("--target=".length);

if (argTarget !== "fixtures" && argTarget !== "production") {
  console.error(`[preflight] ABORTADO — falta --target=fixtures|production (recibido: "${argTarget ?? "(nada)"}"). Nunca se adivina.`);
  process.exit(1);
}

// Carga el archivo de env correspondiente al target DECLARADO — nunca el
// que "debería" cargarse por defecto. Sigue verificándose después contra el
// resultado real (no se confía ciegamente en qué archivo se cargó).
const targetEnv = cargarArchivoEnv(argTarget === "fixtures" ? ".env.fixtures.local" : ".env.local");

const urlEfectiva = resolverDatasourceUrlDesdeEnv(targetEnv);
const resultado = verificarEntornoContraTarget(urlEfectiva, argTarget);

console.log("=".repeat(70));
console.log(`[preflight] target declarado:     ${argTarget}`);
console.log(`[preflight] host resuelto:        ${resultado.host ?? "(ninguno)"}`);
console.log(`[preflight] entorno detectado:    ${resultado.entornoDetectado}`);
console.log("=".repeat(70));

if (!resultado.ok) {
  console.error(`[preflight] ABORTADO — ${resultado.motivo}`);
  process.exit(1);
}

if (!urlEfectiva) {
  console.error("[preflight] ABORTADO — sin datasource URL resuelta.");
  process.exit(1);
}

await ejecutarPreflightReadOnly(urlEfectiva, argTarget);
