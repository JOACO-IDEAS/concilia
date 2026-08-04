"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularSugerenciasSmartMatch, type SugerenciaSmartMatch } from "@/lib/payments/smart-match";
import { notificarPagoMatched } from "@/lib/notifications/send-payment-notifications";

export interface PagoWebhookDTO {
  id: string;
  externalId: string;
  provider: string;
  amount: number;
  currency: string;
  payerIdentifier: string | null;
  concept: string | null;
  status: "PENDING" | "MATCHED" | "UNMATCHED";
  matchedAt: string | null;
  createdAt: string;
  organization: { id: string; name: string } | null;
}

export interface OrganizacionOpcionDTO {
  id: string;
  name: string;
  taxId: string;
}

export interface ListaPagosResultado {
  ok: boolean;
  pagos: PagoWebhookDTO[];
  organizaciones: OrganizacionOpcionDTO[];
  error?: string;
}

/**
 * Lista los pagos recibidos por webhook (más recientes primero) junto con el
 * listado de organizaciones disponibles, para el selector de vínculo manual.
 * Si todavía no hay una base de datos conectada, devuelve listas vacías con
 * `ok: false` en vez de tirar — la UI lo muestra como un estado vacío claro.
 */
export async function obtenerPagosWebhook(): Promise<ListaPagosResultado> {
  try {
    const [pagos, organizaciones] = await Promise.all([
      prisma.paymentTransaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { organization: { select: { id: true, name: true } } },
      }),
      prisma.organization.findMany({
        select: { id: true, name: true, taxId: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      ok: true,
      pagos: pagos.map((p) => ({
        id: p.id,
        externalId: p.externalId,
        provider: p.provider,
        // Decimal (decimal.js) no cruza el límite Server Action -> Client
        // Component como objeto — se serializa a number acá.
        amount: p.amount.toNumber(),
        currency: p.currency,
        payerIdentifier: p.payerIdentifier,
        concept: p.concept,
        status: p.status,
        matchedAt: p.matchedAt ? p.matchedAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
        organization: p.organization,
      })),
      organizaciones,
    };
  } catch (e) {
    return {
      ok: false,
      pagos: [],
      organizaciones: [],
      error:
        e instanceof Error
          ? e.message
          : "No se pudo conectar con la base de datos para leer los pagos.",
    };
  }
}

/**
 * Vincula a mano un PaymentTransaction UNMATCHED (o PENDING) a una
 * Organization elegida por el administrador, y lo marca como MATCHED.
 *
 * Usado tanto por el vínculo manual "a ciegas" (elegir de un <select>) como
 * por "Aprobar Coincidencia" del Módulo de Sugerencias Inteligentes (Smart
 * Match) — en ambos casos es un humano aprobando el vínculo, así que
 * `matchMethod` queda en `MANUAL` (no se agrega un tercer estado para no
 * romper el cálculo de "tasa de reconciliación automática" del dashboard,
 * que solo suma AUTO + MANUAL).
 */
export async function vincularPagoManualmente(
  paymentTransactionId: string,
  organizationId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.paymentTransaction.update({
      where: { id: paymentTransactionId },
      data: { organizationId, status: "MATCHED", matchedAt: new Date(), matchMethod: "MANUAL" },
    });
    revalidatePath("/conciliacion");

    // Recibo de pago por email + WhatsApp — se dispara después de responder,
    // igual que en el webhook (ver src/app/api/v1/webhooks/payments/route.ts).
    // Nunca lanza (ver send-payment-notifications.ts), pero el .catch queda
    // como red de seguridad adicional.
    after(() =>
      notificarPagoMatched(paymentTransactionId).catch((e) =>
        console.error("[conciliacion:vincular-manual] Error inesperado notificando recibo de pago:", e)
      )
    );

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo vincular el pago.",
    };
  }
}

/**
 * Módulo de Gestión de Excepciones Inteligente — Top 3 de organizaciones
 * candidatas para un pago UNMATCHED, con % de confianza (ver
 * src/lib/payments/smart-match.ts para el detalle del heurístico).
 */
export async function obtenerSugerenciasSmartMatch(
  paymentTransactionId: string
): Promise<{ ok: boolean; sugerencias: SugerenciaSmartMatch[]; error?: string }> {
  return calcularSugerenciasSmartMatch(paymentTransactionId);
}
