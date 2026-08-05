"use server";

import { prisma } from "@/lib/prisma";
import { calcularSugerenciasSmartMatch } from "@/lib/payments/smart-match";

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
 * Pregunta 2 de la Bandeja de Trabajo — "¿Qué requiere mi atención?": pagos
 * `UNMATCHED` con la mejor sugerencia de Smart Match ya calculada (Top 1 de
 * `calcularSugerenciasSmartMatch`, reutilizado tal cual, sin duplicar el
 * heurístico). El usuario ve un solo número de confianza y un solo botón,
 * no una tabla ni un modal con 3 opciones.
 */
export async function obtenerBandejaInconsistencias(): Promise<BandejaInconsistenciasResultado> {
  try {
    const pagos = await prisma.paymentTransaction.findMany({
      where: { status: "UNMATCHED" },
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

export interface ResumenBandejaTrabajo {
  ok: boolean;
  autoConciliados: number;
  error?: string;
}

/**
 * Pregunta 1 de la Bandeja de Trabajo — "¿Cuántos pagos se procesaron
 * automáticamente?": cuenta total de `PaymentTransaction` que el motor de
 * reconciliación (webhooks/ingesta) resolvió solo, sin intervención humana
 * (`matchMethod: "AUTO"`). Un número, no un gráfico.
 */
export async function obtenerResumenBandejaTrabajo(): Promise<ResumenBandejaTrabajo> {
  try {
    const autoConciliados = await prisma.paymentTransaction.count({
      where: { status: "MATCHED", matchMethod: "AUTO" },
    });
    return { ok: true, autoConciliados };
  } catch (e) {
    return {
      ok: false,
      autoConciliados: 0,
      error: e instanceof Error ? e.message : "No se pudo consultar el resumen.",
    };
  }
}
