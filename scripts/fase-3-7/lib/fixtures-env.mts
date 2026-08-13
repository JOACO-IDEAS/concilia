// Fase 3.7 — carga de entorno + cinturón de seguridad anti-producción para
// TODOS los scripts de esta fase. Ningún script de fase-3-7 debe importar
// "@/lib/prisma" (ni nada que lo importe transitivamente) ANTES de llamar a
// `cargarEntornoDeFixturesYVerificar()` — ese import fija `DATABASE_URL` en
// el momento en que el módulo se evalúa, así que el orden importa.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Fragmento del host de la rama de PRODUCCIÓN real de ConcilIA (la misma
// que usa .env.local / la app en Vercel) — verificado contra el connection
// string real de producción en esta sesión. Si `DATABASE_URL` contiene esto,
// el script se niega a escribir, sin excepción.
const PRODUCTION_HOST_FRAGMENT = "ep-broad-unit-aw04mt2w";

const APP_ROOT = resolve(import.meta.dirname, "../../..");

function cargarArchivoEnv(nombreArchivo: string): void {
  let texto: string;
  try {
    texto = readFileSync(resolve(APP_ROOT, nombreArchivo), "utf8");
  } catch {
    return;
  }
  for (const linea of texto.split("\n")) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export interface InfoRama {
  databaseUrl: string;
  host: string;
  esProduccion: boolean;
}

/**
 * Carga EXCLUSIVAMENTE `.env.fixtures.local` (nunca `.env.local`) y verifica
 * que el host de `DATABASE_URL` no sea el de producción. Lanza si lo es, o
 * si no hay ninguna URL configurada — nunca continúa en silencio.
 */
export function cargarEntornoDeFixturesYVerificar(): InfoRama {
  cargarArchivoEnv(".env.fixtures.local");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "No hay DATABASE_URL después de cargar .env.fixtures.local — verificá que el archivo existe y tiene la rama dev-fixtures."
    );
  }

  let host: string;
  try {
    host = new URL(databaseUrl).host;
  } catch {
    throw new Error(`DATABASE_URL no es una URL válida: "${databaseUrl}".`);
  }

  const esProduccion = host.includes(PRODUCTION_HOST_FRAGMENT);
  if (esProduccion) {
    throw new Error(
      `DATABASE_URL apunta a la rama de PRODUCCIÓN (host="${host}", contiene "${PRODUCTION_HOST_FRAGMENT}"). ` +
        "Los scripts de Fase 3.7 se niegan a escribir ahí. Verificá .env.fixtures.local."
    );
  }

  return { databaseUrl, host, esProduccion };
}
