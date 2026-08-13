// Safety hardening — post-incidente Fase 5.9 (ver FASE_5_9_INCIDENT_AUDIT.md).
// Módulo PURO (sin I/O, sin conexión a base) — única fuente de verdad de
// "a qué entorno apunta esta URL" y "¿coincide con lo que se declaró querer
// usar?". Reutilizado tanto por `prisma.config.ts` (guardia automática en
// cada comando riesgoso de la CLI) como por
// `scripts/prisma-safety/preflight.mts` (chequeo explícito previo a migrar)
// — una sola implementación, cero posibilidad de que las dos queden
// desincronizadas.
//
// Principio no negociable de esta fase: NUNCA "adivinar" el entorno.
// Cualquier ambigüedad (host desconocido, target no declarado, o
// declaración que no coincide con lo resuelto) es ABORT, nunca un best
// effort.

export const PRODUCTION_HOST_FRAGMENT = "ep-broad-unit-aw04mt2w";
export const FIXTURES_HOST_FRAGMENT = "ep-lively-smoke-aw6piqcw";

export type EntornoPrisma = "production" | "fixtures" | "unknown";

export type TargetDeclarado = "production" | "fixtures";

export interface ResultadoVerificacionEntorno {
  ok: boolean;
  host: string | null;
  entornoDetectado: EntornoPrisma;
  targetDeclarado: TargetDeclarado | null;
  motivo: string;
}

/** Extrae el host de una connection string — `null` si no es una URL válida (nunca lanza). */
export function extraerHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Clasifica un host contra los dos fragmentos conocidos. Si coincidiera con
 * AMBOS (no debería poder pasar nunca en la práctica) o con NINGUNO, es
 * "unknown" — la ambigüedad nunca se resuelve a favor de un valor por
 * defecto.
 */
export function detectarEntornoPorHost(host: string | null | undefined): EntornoPrisma {
  if (!host) return "unknown";
  const esProduccion = host.includes(PRODUCTION_HOST_FRAGMENT);
  const esFixtures = host.includes(FIXTURES_HOST_FRAGMENT);
  if (esProduccion === esFixtures) return "unknown"; // ninguno (false/false) o ambos (true/true, imposible hoy pero no se asume)
  return esProduccion ? "production" : "fixtures";
}

/**
 * Misma cadena de resolución que `prisma.config.ts::datasource.url` — DIRECT_URL
 * primero (conexión sin pooling, la que usan las migraciones), después el
 * nombre que usa la integración de Neon en Vercel, y DATABASE_URL como
 * último recurso. Extraída a función para que la guardia y el preflight
 * nunca puedan calcular un valor distinto del que Prisma realmente va a usar.
 */
export function resolverDatasourceUrlDesdeEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.DIRECT_URL ?? env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
}

/**
 * Verificación central: dado el datasource URL que efectivamente se va a
 * usar (ya sea resuelto desde variables de entorno o tomado de un `--url`
 * explícito — a la función no le importa de dónde vino) y el entorno que el
 * caller DECLARÓ explícitamente querer usar (`PRISMA_TARGET_ENV` u
 * equivalente), determina si es seguro continuar.
 *
 * Reglas, en orden, la primera que aplica gana:
 * 1. Sin `targetDeclarado` válido ("production"|"fixtures") → ABORT. Nunca
 *    se asume un valor por defecto.
 * 2. Host no reconocido (`unknown`) → ABORT. No alcanza con que "no sea
 *    producción" — tiene que ser positivamente el entorno esperado.
 * 3. Entorno detectado distinto del declarado → ABORT. Este es exactamente
 *    el escenario del incidente real: PRISMA_TARGET_ENV="fixtures" pero el
 *    datasource resuelto apunta a producción.
 * 4. Coincide → OK.
 */
export function verificarEntornoContraTarget(
  url: string | null | undefined,
  targetDeclarado: string | null | undefined
): ResultadoVerificacionEntorno {
  const host = extraerHost(url);
  const entornoDetectado = detectarEntornoPorHost(host);
  const targetValido: TargetDeclarado | null =
    targetDeclarado === "production" || targetDeclarado === "fixtures" ? targetDeclarado : null;

  if (!targetValido) {
    return {
      ok: false,
      host,
      entornoDetectado,
      targetDeclarado: null,
      motivo: `No se declaró un entorno objetivo válido (PRISMA_TARGET_ENV="${targetDeclarado ?? ""}"). Debe ser exactamente "production" o "fixtures" — nunca se asume un valor por defecto.`,
    };
  }

  if (entornoDetectado === "unknown") {
    return {
      ok: false,
      host,
      entornoDetectado,
      targetDeclarado: targetValido,
      motivo: `El host resuelto ("${host ?? "sin URL"}") no coincide con ningún entorno conocido (ni producción ni dev-fixtures).`,
    };
  }

  if (entornoDetectado !== targetValido) {
    return {
      ok: false,
      host,
      entornoDetectado,
      targetDeclarado: targetValido,
      motivo: `PRISMA_TARGET_ENV="${targetValido}" pero el datasource resuelto apunta a "${entornoDetectado}" (host "${host}"). Este es exactamente el patrón del incidente de Fase 5.9 — abortado antes de ejecutar nada.`,
    };
  }

  return {
    ok: true,
    host,
    entornoDetectado,
    targetDeclarado: targetValido,
    motivo: `Entorno "${entornoDetectado}" (host "${host}") confirmado — coincide con PRISMA_TARGET_ENV="${targetValido}".`,
  };
}

/** Busca `--url <valor>` o `--url=<valor>` en argv — nunca asume que --url alcanza solo, pero lo usa como la fuente de verdad cuando está presente (gana sobre las variables de entorno). */
export function extraerUrlDeArgv(argv: string[]): string | null {
  const idxEspacio = argv.findIndex((a) => a === "--url");
  if (idxEspacio !== -1 && argv[idxEspacio + 1]) return argv[idxEspacio + 1];
  const conIgual = argv.find((a) => a.startsWith("--url="));
  if (conIgual) return conIgual.slice("--url=".length);
  return null;
}

// Subcomandos de la CLI de Prisma que pueden escribir schema o datos —
// `migrate` (dev/deploy/resolve/reset), `db` (push/execute/seed), `studio`
// (permite editar filas desde la UI). `generate`/`validate`/`format` NUNCA
// activan la guardia — deben seguir funcionando sin fricción nueva (evita
// romper `postinstall`/CI).
const SUBCOMANDOS_RIESGOSOS = new Set(["migrate", "db", "studio"]);

export function esComandoRiesgoso(argv: string[]): boolean {
  return argv.some((a) => SUBCOMANDOS_RIESGOSOS.has(a));
}
