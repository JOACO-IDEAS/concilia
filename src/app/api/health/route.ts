import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { compararConstante } from "@/lib/security/timing-safe-compare";
import { pilotEmailConfigurationStatus } from "@/lib/auth/magic-link-email";

const PILOT_EMAIL_READINESS_QUERY = "pilot-email-readiness";

/** El query explícito evita telemetría en health checks regulares. El body
 * permanece idéntico: sólo Vercel recibe el evento allowlisted. */
function logPilotEmailReadiness(request: NextRequest) {
  if (request.nextUrl.searchParams.get("check") !== PILOT_EMAIL_READINESS_QUERY) return;
  const status = pilotEmailConfigurationStatus();
  const payload = status.ready
    ? { event: "PILOT_EMAIL_CONFIG_READY" }
    : { event: "PILOT_EMAIL_CONFIG_NOT_READY", safeCode: status.safeCode };
  console.info(JSON.stringify(payload));
}

/**
 * GET /api/health
 *
 * Healthcheck de la base de datos real (Postgres). Pensado para:
 *  - Monitoreo simple (uptime checks, Vercel, status pages): alcanza con
 *    mirar el código HTTP (200 = ok, 503 = caído), sin necesitar auth.
 *  - Diagnóstico detallado (latencia, conteo de filas en las tablas clave):
 *    requiere `HEALTH_CHECK_SECRET` vía `?key=` o header `x-health-key`. Si
 *    esa variable no está configurada, se devuelve igual el detalle
 *    completo (no tiene sentido exigir un secreto que nadie configuró en un
 *    entorno de desarrollo/staging) — es una protección opcional, no
 *    fail-closed como la de los webhooks.
 *
 * No rompe si no hay base de datos conectada: responde 503 con un mensaje
 * claro en vez de tirar un 500 sin contexto. El detalle del error siempre
 * pasa por `resumirError` — nunca se devuelve el mensaje crudo de
 * Prisma/pg, que puede incluir paths internos del filesystem.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.HEALTH_CHECK_SECRET;
  const provisto = request.nextUrl.searchParams.get("key") ?? request.headers.get("x-health-key");
  const autorizado = !secret || (provisto !== null && compararConstante(secret, provisto));

  const inicio = Date.now();
  logPilotEmailReadiness(request);

  try {
    const [organizations, paymentTransactions] = await Promise.all([
      prisma.organization.count(),
      prisma.paymentTransaction.count(),
    ]);
    const latencyMs = Date.now() - inicio;

    if (!autorizado) {
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    return NextResponse.json(
      {
        status: "ok",
        database: { connected: true, latencyMs },
        tables: { organizations, paymentTransactions },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (e) {
    const latencyMs = Date.now() - inicio;
    console.error("[health] Chequeo de base de datos falló:", e);

    if (!autorizado) {
      return NextResponse.json({ status: "down" }, { status: 503 });
    }

    return NextResponse.json(
      {
        status: "down",
        database: { connected: false, latencyMs },
        error: resumirError(e),
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}

/**
 * Convierte el error crudo de Prisma/pg en un resumen corto y legible — NUNCA
 * se devuelve `e.message`/`e.stack` tal cual: el mensaje de
 * PrismaClientKnownRequestError suele incluir paths absolutos del
 * filesystem y fragmentos del bundle, que no deberían quedar expuestos en
 * la respuesta de un endpoint público.
 */
function resumirError(e: unknown): string {
  const code = typeof e === "object" && e !== null && "code" in e ? String(e.code) : "";
  if (/ECONNREFUSED|ENOTFOUND|P1001/i.test(code)) return "No se pudo conectar con la base de datos.";
  if (/P1002/i.test(code)) return "La base de datos no respondió a tiempo (timeout).";
  if (/P1003/i.test(code)) return "La base de datos configurada no existe.";
  if (/P1010|28P01/i.test(code)) return "Credenciales de conexión inválidas.";
  if (code) return `Error de base de datos (código ${code}).`;
  return "Error desconocido al consultar la base de datos.";
}
