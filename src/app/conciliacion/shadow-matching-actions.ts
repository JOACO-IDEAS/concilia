"use server";

// Observabilidad técnica del motor de matching en modo sombra — Fase 3.6
// (RECONCILIATION_MATCHING_ARCHITECTURE.md / pedido de Fase 3.6, Parte 1).
// 100% READ-ONLY: estas dos funciones son wrappers directos de
// src/lib/reconciliation/observability.ts — ninguna escribe nada. No hay
// "aprobar"/"rechazar"/"conciliar" acá ni en ningún lado que dependa de
// esto: el motor sigue en modo sombra, esto es solo para poder inspeccionar
// sus resultados ya persistidos en `ShadowMatchLog`.

import { obtenerMetricas, obtenerResultadoShadowFormateado } from "@/lib/reconciliation/observability";
import type { ShadowMetrics } from "@/lib/reconciliation/observability";

export async function obtenerMetricasShadowAction(): Promise<ShadowMetrics> {
  return obtenerMetricas();
}

export async function obtenerResultadoShadowAction(paymentTransactionId: string): Promise<string | null> {
  const id = paymentTransactionId.trim();
  if (!id) return null;
  return obtenerResultadoShadowFormateado(id);
}
