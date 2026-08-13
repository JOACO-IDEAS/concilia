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

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { resolverDatasourceUrlDesdeEnv, verificarEntornoContraTarget } from "../../src/lib/prisma-safety/entornos.ts";

const APP_ROOT = resolve(import.meta.dirname, "../..");

function cargarArchivoEnv(nombreArchivo: string): void {
  let texto: string;
  try {
    texto = readFileSync(resolve(APP_ROOT, nombreArchivo), "utf8");
  } catch {
    console.error(`[preflight] No se pudo leer ${nombreArchivo} — abortando.`);
    process.exit(1);
  }
  for (const linea of texto.split("\n")) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
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
cargarArchivoEnv(argTarget === "fixtures" ? ".env.fixtures.local" : ".env.local");

const urlEfectiva = resolverDatasourceUrlDesdeEnv(process.env);
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

// Recién acá, con el entorno YA confirmado, se abre una conexión — y
// exclusivamente para SELECTs de introspección.
const { Client } = await import("pg");
const client = new Client({ connectionString: urlEfectiva });
await client.connect();

try {
  const { rows: dbRows } = await client.query<{ current_database: string; current_schema: string }>(
    "SELECT current_database(), current_schema();"
  );
  const { current_database: database, current_schema: schema } = dbRows[0];
  console.log(`[preflight] database:             ${database}`);
  console.log(`[preflight] schema:               ${schema}`);

  let aplicadas: string[] = [];
  try {
    const { rows } = await client.query<{ migration_name: string }>(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY started_at ASC;"
    );
    aplicadas = rows.map((r) => r.migration_name);
  } catch {
    console.log("[preflight] (no existe _prisma_migrations todavía en este destino — 0 migraciones aplicadas)");
  }

  const locales = readdirSync(resolve(APP_ROOT, "prisma/migrations"))
    .filter((f) => f !== "migration_lock.toml")
    .sort();

  const pendientes = locales.filter((m) => !aplicadas.includes(m));

  console.log(`[preflight] migraciones aplicadas en destino: ${aplicadas.length}`);
  console.log(`[preflight] migraciones locales en el repo:   ${locales.length}`);
  console.log(`[preflight] migraciones PENDIENTES:           ${pendientes.length}`);
  if (pendientes.length > 0) {
    for (const p of pendientes) console.log(`  - ${p}`);
  }

  console.log("=".repeat(70));
  console.log(`[preflight] OK — seguro proceder contra "${resultado.entornoDetectado}" (host confirmado, entorno confirmado).`);
} finally {
  await client.end();
}
