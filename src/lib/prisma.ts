import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Cliente Prisma del backend real de ConcilIA (Administración / Contactos /
// Facturación, Importación masiva, Webhooks de pagos). El resto de la app
// (dashboard, conciliación manual, morosidad, etc.) sigue corriendo 100%
// sobre datos mock en memoria (ver src/lib/store.tsx) — son módulos
// independientes.
//
// Importante: si DATABASE_URL no está configurada, este módulo NO lanza una
// excepción al importarse — usa un connection string placeholder a
// propósito. Si tirábamos acá, el error saltaría durante la simple carga del
// módulo, ANTES de que el try/catch del código que llama (una Server Action,
// un Route Handler) llegue a ejecutarse, resultando en un 500 genérico en
// vez del mensaje claro que arma cada caller. Con este enfoque, el error
// real ("no se pudo conectar a la base") recién aparece al ejecutar la
// primera query — que es justo donde cada caller ya tiene su propio
// try/catch (ver src/app/importar/actions.ts y
// src/app/api/v1/webhooks/payments/route.ts).
const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://no-configurado:no-configurado@localhost:5432/no-configurado";

// Patrón singleton: en desarrollo, Next.js recarga módulos en cada cambio de
// archivo (HMR), lo que crearía un PrismaClient nuevo — y una conexión nueva
// a la base — en cada guardado. Cacheamos la instancia en `globalThis` para
// reutilizar siempre la misma conexión.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({ connectionString });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
