import { spawnSync } from "node:child_process";
import { readFileSync, renameSync, chmodSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  analizarHostNeon,
  FIXTURES_HOST_FRAGMENT,
  PRODUCTION_HOST_FRAGMENT,
} from "../../src/lib/prisma-safety/entornos.ts";

const APP_ROOT = resolve(import.meta.dirname, "../..");
const ENV_FILE = resolve(APP_ROOT, ".env.fixtures.local");

function leerSecreto(prompt: string): string {
  const result = spawnSync(
    "/bin/zsh",
    ["-c", `read -rs 'REPLY?${prompt}'; print -r -- "$REPLY"`],
    { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Entrada cancelada.");
  return result.stdout.replace(/\r?\n$/, "").trim();
}

function validarUrl(raw: string, expectedPooled: boolean): URL {
  if (!raw) throw new Error("La URL no puede estar vacía.");
  if (/["\r\n]/.test(raw)) throw new Error("La URL contiene caracteres no permitidos.");

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("La URL no tiene sintaxis válida.");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("La URL no usa el protocolo PostgreSQL.");
  }
  if (!parsed.hostname.endsWith(".neon.tech")) throw new Error("El hostname no pertenece a neon.tech.");

  const neon = analizarHostNeon(parsed.hostname);
  if (!neon || neon.endpointId !== FIXTURES_HOST_FRAGMENT || neon.endpointId === PRODUCTION_HOST_FRAGMENT) {
    throw new Error("El endpoint no coincide con fixtures autorizado.");
  }
  if (neon.pooled !== expectedPooled) {
    throw new Error(expectedPooled ? "DATABASE_URL debe ser pooled (-pooler)." : "DATABASE_URL_UNPOOLED debe ser direct (sin -pooler).");
  }
  if (parsed.pathname.replace(/^\//, "") !== "neondb") throw new Error("La database debe ser neondb.");
  if (parsed.searchParams.get("sslmode") !== "require") throw new Error("La URL debe incluir sslmode=require.");
  if (!parsed.username || !parsed.password) throw new Error("La URL debe incluir usuario y password.");
  return parsed;
}

function reemplazarVariables(original: string, values: Record<string, string>): string {
  const seen = new Set<string>();
  const lines = original.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match || !(match[1] in values)) return line;
    seen.add(match[1]);
    return `${match[1]}="${values[match[1]]}"`;
  });
  for (const [name, value] of Object.entries(values)) {
    if (!seen.has(name)) lines.push(`${name}="${value}"`);
  }
  return lines.join("\n");
}

const pooledRaw = leerSecreto("DATABASE_URL pooled: ");
process.stderr.write("\n");
const directRaw = leerSecreto("DATABASE_URL_UNPOOLED direct: ");
process.stderr.write("\n");

const pooled = validarUrl(pooledRaw, true);
const direct = validarUrl(directRaw, false);
if (pooled.username !== direct.username || pooled.password !== direct.password || pooled.pathname !== direct.pathname) {
  throw new Error("Las URLs pooled y direct no tienen las mismas credenciales/database.");
}

const original = readFileSync(ENV_FILE, "utf8");
const updated = reemplazarVariables(original, {
  DATABASE_URL: pooledRaw,
  DATABASE_URL_UNPOOLED: directRaw,
});
const temporary = `${ENV_FILE}.tmp-${process.pid}`;

try {
  writeFileSync(temporary, updated, { encoding: "utf8", mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, ENV_FILE);
  chmodSync(ENV_FILE, 0o600);
  process.stdout.write("Credenciales fixtures actualizadas de forma segura; permisos 0600.\n");
} finally {
  if (existsSync(temporary)) unlinkSync(temporary);
}
