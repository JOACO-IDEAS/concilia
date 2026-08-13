// Fase 5.2 — mejora 2 del plan de Fase 5.2 (ver FASE_5_2_DIAGNOSTICO_Y_PLAN.md
// Parte 10.D y FASE_5_2B_PAYMENT_EVIDENCE_LOOP.md Parte 4): resumen de
// compliance agregado por consorcio — "Consorcio X: N documentos, 1
// vencido, 2 próximos a vencer, N observaciones abiertas".
//
// 100% derivado en lectura, cero tabla nueva, cero campo nuevo. Reutiliza
// `calcularEstadoDocumento` (sin tocarlo) para el estado de cada
// `ProviderDocument`, y `obtenerBandejaDeTrabajo` (sin tocarlo) para el
// conteo de observaciones de Compliance de ese consorcio — evita duplicar
// la resolución de organización que `work-queue.ts` ya implementó
// correctamente en Fase 4.F (directa o vía ProviderOrganization).

import type { Prisma } from "@/generated/prisma/client";
import { calcularEstadoDocumento } from "./document-status";
import { obtenerBandejaDeTrabajo } from "@/lib/agent-os/work-queue";

export interface ResumenComplianceConsorcio {
  organizationId: string;
  documentosVigentes: number;
  documentosPorVencer: number;
  documentosVencidos: number;
  documentosSinVencimiento: number;
  observacionesAbiertas: number;
}

export interface OpcionesResumenCompliance {
  ventanaDiasProximoAVencer?: number;
  ahora?: Date;
}

/**
 * Documentos considerados: los específicos de esta organización
 * (`organizationId` directo) MÁS los reutilizables de cualquier proveedor
 * que sirva a esta organización (`organizationId=null`, vía
 * `ProviderOrganization` activa) — mismo criterio de resolución ya usado en
 * `resumen-operativo.ts` (Fase 4.F), no una regla nueva.
 */
export async function obtenerResumenComplianceDeConsorcio(
  tx: Prisma.TransactionClient,
  organizationId: string,
  opciones: OpcionesResumenCompliance = {}
): Promise<ResumenComplianceConsorcio> {
  const documentos = await tx.providerDocument.findMany({
    where: {
      deletedAt: null,
      OR: [{ organizationId }, { organizationId: null, provider: { organizations: { some: { organizationId, activo: true } } } }],
    },
    select: { validTo: true },
  });

  let documentosVigentes = 0;
  let documentosPorVencer = 0;
  let documentosVencidos = 0;
  let documentosSinVencimiento = 0;

  for (const documento of documentos) {
    const estado = calcularEstadoDocumento(documento, opciones);
    if (estado === "VALID") documentosVigentes++;
    else if (estado === "EXPIRING_SOON") documentosPorVencer++;
    else if (estado === "EXPIRED") documentosVencidos++;
    else documentosSinVencimiento++;
  }

  const bandeja = await obtenerBandejaDeTrabajo(tx, { organizationId });
  const observacionesAbiertas = bandeja.observacionesAbiertas.filter((o) => o.agentType === "COMPLIANCE").length;

  return { organizationId, documentosVigentes, documentosPorVencer, documentosVencidos, documentosSinVencimiento, observacionesAbiertas };
}
