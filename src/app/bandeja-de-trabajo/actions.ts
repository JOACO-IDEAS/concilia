"use server";

import { prisma } from "@/lib/prisma";

// obtenerBandejaInconsistencias (+ tipos) se movió a payments-actions.ts —
// es el mismo dato que usa /conciliacion, una sola fuente de verdad para
// "qué necesita aprobación" en todo el producto. bandeja-de-trabajo/page.tsx
// la importa directo de ahí.

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
