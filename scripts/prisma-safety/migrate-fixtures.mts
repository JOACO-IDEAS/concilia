import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { planificarMigracionFixtures } from "../../src/lib/prisma-safety/fixtures-migration-plan.ts";
import { ejecutarPreflightReadOnly } from "./preflight-core.mts";

const APP_ROOT = resolve(import.meta.dirname, "../..");

function cargarFixturesEnv(): NodeJS.ProcessEnv {
  let text: string;
  try {
    text = readFileSync(resolve(APP_ROOT, ".env.fixtures.local"), "utf8");
  } catch {
    throw new Error("No existe .env.fixtures.local — abortando.");
  }
  const env = {} as NodeJS.ProcessEnv;
  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const plan = planificarMigracionFixtures(cargarFixturesEnv());
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
