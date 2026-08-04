import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// `dotenv/config` por sí solo únicamente carga `.env`. `.env.local` es el
// archivo que genera `vercel env pull` / `vercel integration add` con las
// variables reales del proyecto (convención de Next.js: `.env.local` pisa a
// `.env`) — hay que cargarlo a mano para que la CLI de Prisma vea las mismas
// variables que vería la app corriendo con `next dev`.
loadEnv();
loadEnv({ path: ".env.local", override: true });

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
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  },
});
