// Fase 4.F — resumen ejecutivo del panel operativo. Puramente de LECTURA,
// agrega conteos reales de dos dominios que ya existen (Matching/Compliance)
// sin inventar ninguna métrica — mismo principio ya aplicado a "Tiempo
// recuperado" en Fase 4 Parte E ("no maquillar el estado, no inventar
// resultados"). Nunca calcula "horas ahorradas": eso queda para una fase
// futura cuando exista evidencia real medible (ver informe de Fase 4 Parte E).

import type { Prisma } from "@/generated/prisma/client";
import { MATCH_ENGINE_VERSION } from "@/lib/reconciliation/version";

// Deliberadamente NO incluye "problemasDetectados" acá — ese número YA lo
// calcula work-queue.ts (`requierenAtencion + enSeguimiento`), con la
// resolución de organización correcta (directa o vía ProviderOrganization).
// Duplicar esa resolución acá violaría "no dupliques observaciones/lógica
// innecesariamente" — el caller (panel-operativo/actions.ts) combina ambos.
export interface ResumenOperativo {
  pagosAnalizados: number; // ShadowMatchLog evaluados en la versión ACTUAL del motor
  documentosRevisados: number; // ProviderDocument reales cargados
}

export interface OpcionesResumen {
  organizationId?: string;
}

export async function obtenerResumenOperativo(
  tx: Prisma.TransactionClient,
  opciones: OpcionesResumen = {}
): Promise<ResumenOperativo> {
  const { organizationId } = opciones;

  const [pagosAnalizados, documentosRevisados] = await Promise.all([
    tx.shadowMatchLog.count({
      where: {
        engineVersion: MATCH_ENGINE_VERSION,
        ...(organizationId ? { paymentTransaction: { organizationId } } : {}),
      },
    }),
    tx.providerDocument.count({
      where: {
        deletedAt: null,
        ...(organizationId
          ? { OR: [{ organizationId }, { organizationId: null, provider: { organizations: { some: { organizationId, activo: true } } } }] }
          : {}),
      },
    }),
  ]);

  return { pagosAnalizados, documentosRevisados };
}
