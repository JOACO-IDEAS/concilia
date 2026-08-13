"use server";

import { prisma } from "@/lib/prisma";

// obtenerBandejaInconsistencias (+ tipos) se movió a payments-actions.ts —
// es el mismo dato que usa /conciliacion, una sola fuente de verdad para
// "qué necesita aprobación" en todo el producto. bandeja-de-trabajo/page.tsx
// la importa directo de ahí.

export interface ResumenBandejaTrabajo {
  ok: boolean;
  organizacionAutoResuelta: number;
  error?: string;
}

/**
 * Pregunta 1 de la Bandeja de Trabajo — "¿En cuántos pagos identificamos la
 * organización automáticamente?": cuenta total de `PaymentTransaction` cuya
 * ORGANIZACIÓN (Capa 1, `reconcile-payment.ts` — CUIT/CBU exacto) se resolvió
 * sola, sin intervención humana (`matchMethod: "AUTO"`). Un número, no un
 * gráfico.
 *
 * Fase 5.6 — renombrado a propósito desde `autoConciliados`: esto NUNCA
 * significa que la Unidad Funcional o la obligación quedaron identificadas,
 * ni que hubo una conciliación contable — solo que ConcilIA supo a qué
 * consorcio pertenece el dinero (ver FASE_5_5_AUDITORIA_AUTO.md).
 */
export async function obtenerResumenBandejaTrabajo(): Promise<ResumenBandejaTrabajo> {
  try {
    const organizacionAutoResuelta = await prisma.paymentTransaction.count({
      where: { status: "MATCHED", matchMethod: "AUTO" },
    });
    return { ok: true, organizacionAutoResuelta };
  } catch (e) {
    return {
      ok: false,
      organizacionAutoResuelta: 0,
      error: e instanceof Error ? e.message : "No se pudo consultar el resumen.",
    };
  }
}
