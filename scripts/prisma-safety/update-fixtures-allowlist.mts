import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { analizarHostNeon, PRODUCTION_HOST_FRAGMENT } from "../../src/lib/prisma-safety/entornos.ts";

const APP_ROOT = resolve(import.meta.dirname, "../..");
const TARGET = resolve(APP_ROOT, "src/lib/prisma-safety/entornos.ts");

const prompt = createInterface({ input: stdin, output: stdout });
const raw = (await prompt.question("Hostname pooled de dev-fixtures (sin URL ni credenciales): ")).trim().toLowerCase().replace(/\.$/, "");
prompt.close();

if (!raw || raw.includes("://") || /[@/?#\s]/.test(raw)) {
  throw new Error("Ingresá únicamente el hostname DNS, sin protocolo, path, usuario ni password.");
}
if (!raw.endsWith(".neon.tech")) throw new Error("El hostname no pertenece al dominio oficial neon.tech.");

const parsed = analizarHostNeon(raw);
if (!parsed?.pooled) throw new Error("El hostname debe ser el endpoint pooled y terminar su primer label en -pooler.");
if (parsed.endpointId === PRODUCTION_HOST_FRAGMENT) throw new Error("El hostname corresponde a Production — abortado.");

const source = readFileSync(TARGET, "utf8");
const pattern = /export const FIXTURES_HOST_FRAGMENT = "[^"]+";/;
if (!pattern.test(source)) throw new Error("No se encontró una única constante central de fixtures.");
const updated = source.replace(pattern, `export const FIXTURES_HOST_FRAGMENT = "${parsed.endpointId}";`);
if (updated === source) throw new Error("La allowlist ya contiene exactamente ese endpoint ID.");

writeFileSync(TARGET, updated, "utf8");
console.log("Allowlist central actualizada desde el hostname pooled; no se leyó ningún archivo .env.");
