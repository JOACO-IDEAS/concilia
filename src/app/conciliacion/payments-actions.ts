"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularSugerenciasSmartMatch, type SugerenciaSmartMatch } from "@/lib/payments/smart-match";
import { notificarPagoMatched } from "@/lib/notifications/send-payment-notifications";
import { requireCurrentAdministrator } from "@/lib/auth/session";
import { requireOrganizationAccess } from "@/lib/auth/organization-access";
import { requirePaymentAccess } from "@/lib/auth/resource-access";

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
    const administrator = await requireCurrentAdministrator();
    const [pagos, organizaciones] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where: { organization: { administrators: { some: { administratorId: administrator.id } } } },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { organization: { select: { id: true, name: true } } },
      }),
      prisma.organization.findMany({ where: { administrators: { some: { administratorId: administrator.id } } },
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
    const payment = await prisma.paymentTransaction.findUnique({ where: { id: paymentTransactionId }, select: { organizationId: true } });
    if (!payment) return { ok: false, error: "Pago no disponible." };
    await requireOrganizationAccess(organizationId);
    if (payment.organizationId && payment.organizationId !== organizationId) return { ok: false, error: "No se puede vincular recursos de organizaciones distintas." };
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
  await requirePaymentAccess(paymentTransactionId);
  return calcularSugerenciasSmartMatch(paymentTransactionId);
}

export interface SugerenciaInconsistenciaDTO {
  organizationId: string;
  organizationName: string;
  confidence: number;
  motivo: string;
}

export interface InconsistenciaDTO {
  id: string;
  amount: number;
  currency: string;
  concept: string | null;
  payerIdentifier: string | null;
  createdAt: string;
  sugerencia: SugerenciaInconsistenciaDTO | null;
}

export interface BandejaInconsistenciasResultado {
  ok: boolean;
  items: InconsistenciaDTO[];
  error?: string;
}

/**
 * "Necesita tu aprobación" — pagos `UNMATCHED` con la mejor sugerencia de
 * Smart Match ya calculada (Top 1 de `calcularSugerenciasSmartMatch`, sin
 * duplicar el heurístico). Única fuente de verdad, usada tanto por
 * `/conciliacion` como por la Bandeja de Trabajo — un solo número de
 * confianza y un solo botón por pago, no una tabla ni un modal con 3
 * opciones.
 */
export async function obtenerBandejaInconsistencias(): Promise<BandejaInconsistenciasResultado> {
  try {
    const administrator = await requireCurrentAdministrator();
    const pagos = await prisma.paymentTransaction.findMany({
      where: { status: "UNMATCHED", organization: { administrators: { some: { administratorId: administrator.id } } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    const items: InconsistenciaDTO[] = [];
    for (const pago of pagos) {
      const resultado = await calcularSugerenciasSmartMatch(pago.id);
      const top = resultado.ok ? resultado.sugerencias[0] : undefined;

      items.push({
        id: pago.id,
        amount: pago.amount.toNumber(),
        currency: pago.currency,
        concept: pago.concept,
        payerIdentifier: pago.payerIdentifier,
        createdAt: pago.createdAt.toISOString(),
        sugerencia: top
          ? {
              organizationId: top.organizationId,
              organizationName: top.organizationName,
              confidence: top.confidence,
              motivo: top.motivo,
            }
          : null,
      });
    }

    return { ok: true, items };
  } catch (e) {
    return {
      ok: false,
      items: [],
      error: e instanceof Error ? e.message : "No se pudo consultar la bandeja de inconsistencias.",
    };
  }
}
