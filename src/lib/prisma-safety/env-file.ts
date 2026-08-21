import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** Parser deliberadamente mínimo, idéntico al formato soportado históricamente por los scripts. */
export function parsearVariablesEnv(text: string): NodeJS.ProcessEnv {
  const parsed = {} as NodeJS.ProcessEnv;
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    parsed[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return parsed;
}

/** Carga aislada: nunca mezcla ni muta process.env. */
export function cargarVariablesEnvAisladas(path: string): NodeJS.ProcessEnv {
  return parsearVariablesEnv(readFileSync(path, "utf8"));
}

/** Sólo para asserts/diagnóstico seguro; nunca devuelve parte del valor original. */
export function fingerprintDatasource(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
