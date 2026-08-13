import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";
import {
  esComandoRiesgoso,
  extraerUrlDeArgv,
  resolverDatasourceUrlDesdeEnv,
  verificarEntornoContraTarget,
} from "./src/lib/prisma-safety/entornos";

// `dotenv/config` por sí solo únicamente carga `.env`. `.env.local` es el
// archivo que genera `vercel env pull` / `vercel integration add` con las
// variables reales del proyecto (convención de Next.js: `.env.local` pisa a
// `.env`) — hay que cargarlo a mano para que la CLI de Prisma vea las mismas
// variables que vería la app corriendo con `next dev`.
loadEnv();
loadEnv({ path: ".env.local", override: true });

// ============================================================================
// Safety hardening — post-incidente Fase 5.9 (ver FASE_5_9_INCIDENT_AUDIT.md
// y FASE_5_9_SAFETY_HARDENING.md). El `override: true` de arriba es
// deliberado y se mantiene (necesario para que `.env.local` siempre gane
// sobre un `.env` desactualizado) — pero tiene un efecto colateral real: NO
// HAY NINGÚN `export DATABASE_URL=...` de shell que pueda ganarle. El
// incidente ocurrió exactamente así: se exportó la URL de dev-fixtures
// antes de invocar `prisma migrate dev`, y este archivo la pisó en
// silencio con producción.
//
// La guardia de abajo NO depende de variables de entorno para decidir si
// algo es seguro — verifica el valor EFECTIVO ya resuelto (el mismo que se
// va a usar) contra un entorno DECLARADO EXPLÍCITAMENTE (`PRISMA_TARGET_ENV`).
// Se activa únicamente para subcomandos que pueden escribir schema/datos
// (`migrate`, `db`, `studio`) — `generate`/`validate`/`format` siguen
// funcionando exactamente igual que antes, sin fricción nueva (no debe
// romper `postinstall` ni CI).
const argv = process.argv;
const urlEfectiva = extraerUrlDeArgv(argv) ?? resolverDatasourceUrlDesdeEnv(process.env);

if (esComandoRiesgoso(argv)) {
  const resultado = verificarEntornoContraTarget(urlEfectiva, process.env.PRISMA_TARGET_ENV);
  console.log(
    `[prisma-safety] comando riesgoso detectado ("${argv.slice(2).join(" ")}") — host resuelto: ${resultado.host ?? "(ninguno)"} — entorno detectado: ${resultado.entornoDetectado} — target declarado (PRISMA_TARGET_ENV): ${resultado.targetDeclarado ?? "(no declarado)"}`
  );
  if (!resultado.ok) {
    console.error(`[prisma-safety] ABORTADO — ${resultado.motivo}`);
    console.error(
      `[prisma-safety] Para continuar, declará explícitamente PRISMA_TARGET_ENV=fixtures|production y verificá con scripts/prisma-safety/preflight.mts antes de reintentar. Ver FASE_5_9_SAFETY_HARDENING.md.`
    );
    process.exit(1);
  }
  console.log(`[prisma-safety] OK — ${resultado.motivo}`);
}

// Nota: usamos `process.env` directo (en vez del helper `env()` de Prisma)
// a propósito — `env()` lanza un error si la variable no está definida, lo
// que rompería `prisma generate` (y por lo tanto el build en Vercel, que
// corre `postinstall` sin tener todavía una base de datos conectada). Con
// `process.env` el valor puede ser `undefined` sin frenar el build; recién
// se exige una URL real al ejecutar comandos que sí necesitan conectarse
// (migrate deploy, db seed, o el runtime de la app vía src/lib/prisma.ts).
//
// DATABASE_URL vs DIRECT_URL: Neon/Supabase (y la mayoría de los proveedores
// serverless de Postgres) ofrecen dos connection strings — una "pooled" (a
// través de PgBouncer, para queries normales en runtime serverless) y una
// "direct"/unpooled (conexión de sesión completa, necesaria para que el
// motor de migraciones de Prisma pueda tomar los advisory locks que usa
// `migrate deploy`; PgBouncer en modo transacción no los soporta).
//
// Nota: en Prisma 7 con driver adapters, `datasource.url` acá SOLO lo usan
// los comandos de la CLI (migrate deploy/dev, db pull, studio) — el cliente
// en runtime de la app (src/lib/prisma.ts) arma su propio adapter desde
// DATABASE_URL de forma independiente, sin leer este archivo. Por eso este
// `url` apunta a la conexión directa (con fallback a DATABASE_URL si no está
// separada): así las migraciones corren siempre por la conexión directa,
// mientras el runtime de la app sigue usando la pooled sin que este archivo
// lo afecte. Esta versión de `prisma/config` no expone un campo `directUrl`
// propio.
//
// El nombre de la variable "direct" varía según quién la provisionó:
//  - DIRECT_URL: convención de Prisma con Supabase (y la que documentamos
//    nosotros en .env.example).
//  - DATABASE_URL_UNPOOLED: la integración de Neon en Vercel Marketplace usa
//    este nombre (ver .env.local generado por `vercel integration add neon`).
// Se prueban ambas antes de caer a DATABASE_URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Comando usado por `prisma db seed` (ver prisma/seed.ts).
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Mismo valor que acaba de verificar la guardia de arriba (nunca un
    // cálculo separado que pudiera desincronizarse) — respeta `--url`
    // explícito si se pasó, si no cae a la cadena DIRECT_URL/UNPOOLED/DATABASE_URL.
    url: urlEfectiva,
  },
});
