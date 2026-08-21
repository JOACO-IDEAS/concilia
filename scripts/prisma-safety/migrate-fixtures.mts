import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { planificarMigracionFixtures } from "../../src/lib/prisma-safety/fixtures-migration-plan.ts";
import { cargarVariablesEnvAisladas } from "../../src/lib/prisma-safety/env-file.ts";
import { ejecutarPreflightReadOnly } from "./preflight-core.mts";

const APP_ROOT = resolve(import.meta.dirname, "../..");

const fixturesEnv = cargarVariablesEnvAisladas(resolve(APP_ROOT, ".env.fixtures.local"));
const plan = planificarMigracionFixtures(fixturesEnv);
console.log(`[migrate-fixtures] Endpoint resuelto una sola vez desde ${plan.sourceVariable}.`);
console.log(`[migrate-fixtures] Host autorizado: ${plan.host}`);
console.log("[migrate-fixtures] Paso 1/2 — preflight read-only sobre el endpoint resuelto...");
await ejecutarPreflightReadOnly(plan.endpoint, "fixtures");

console.log("[migrate-fixtures] Paso 2/2 — migrate dev sobre EXACTAMENTE el endpoint validado...");
const result = spawnSync(
  "npx",
  ["prisma", "migrate", "dev", "--url", plan.endpoint, ...process.argv.slice(2)],
  { cwd: APP_ROOT, env: { ...process.env, PRISMA_TARGET_ENV: "fixtures" }, stdio: "inherit" }
);
// Un Error de child_process puede incluir spawnargs; como spawnargs contiene
// --url, jamás serializamos ni relanzamos ese objeto completo.
if (result.error) {
  console.error("[migrate-fixtures] No se pudo iniciar Prisma; detalle sensible omitido.");
  process.exit(1);
}
process.exit(result.status ?? 1);
