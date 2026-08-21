import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { TargetDeclarado } from "../../src/lib/prisma-safety/entornos.ts";

const APP_ROOT = resolve(import.meta.dirname, "../..");

/** Sólo SELECT. Recibe el endpoint ya resuelto/validado; nunca vuelve a elegir otro. */
export async function ejecutarPreflightReadOnly(url: string, target: TargetDeclarado) {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows: dbRows } = await client.query<{ current_database: string; current_schema: string }>("SELECT current_database(), current_schema();");
    const { current_database: database, current_schema: schema } = dbRows[0];
    console.log(`[preflight] database:             ${database}`);
    console.log(`[preflight] schema:               ${schema}`);
    let aplicadas: string[] = [];
    try {
      const { rows } = await client.query<{ migration_name: string }>(
        "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY started_at ASC;"
      );
      aplicadas = rows.map((row) => row.migration_name);
    } catch {
      console.log("[preflight] (no existe _prisma_migrations todavía en este destino — 0 migraciones aplicadas)");
    }
    const locales = readdirSync(resolve(APP_ROOT, "prisma/migrations")).filter((file) => file !== "migration_lock.toml").sort();
    const pendientes = locales.filter((migration) => !aplicadas.includes(migration));
    console.log(`[preflight] migraciones aplicadas en destino: ${aplicadas.length}`);
    console.log(`[preflight] migraciones locales en el repo:   ${locales.length}`);
    console.log(`[preflight] migraciones PENDIENTES:           ${pendientes.length}`);
    for (const pending of pendientes) console.log(`  - ${pending}`);
    console.log("=".repeat(70));
    console.log(`[preflight] OK — seguro proceder contra "${target}" (endpoint validado y conexión confirmada).`);
  } finally {
    await client.end();
  }
}
