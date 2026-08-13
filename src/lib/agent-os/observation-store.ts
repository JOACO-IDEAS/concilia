// Agent OS — Fase 4 Parte D. Persistencia de AgentObservation — el ÚNICO
// lugar del sistema que escribe en esa tabla. Ningún detector (ver
// src/lib/compliance/compliance-detector.ts) llama a Prisma directamente
// para escribir — siempre pasa por acá, mismo principio de desacople ya
// usado entre match-engine.ts y shadow-store.ts.
//
// 100% observación: estas funciones nunca tocan ninguna tabla de dominio
// (Provider/ProviderDocument/Organization/PaymentTransaction/Obligation/
// UnitOwner/ReconciliationMatch) — únicamente `agent_observations`.

import type { Prisma } from "@/generated/prisma/client";
import type { AgentType, ObservacionAgente, ObservacionAgentePersistida } from "./types";

function aJson(valor: Record<string, unknown>): Prisma.InputJsonValue {
  return valor as Prisma.InputJsonValue;
}

function deFila(fila: {
  id: string;
  agentType: string;
  type: string;
  severity: string;
  status: string;
  providerId: string | null;
  providerDocumentId: string | null;
  organizationId: string | null;
  paymentTransactionId: string | null;
  explanation: string;
  evidence: unknown;
  suggestedAction: string | null;
  source: string;
  confidence: number | null;
  dedupeKey: string;
  detectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): ObservacionAgentePersistida {
  return {
    id: fila.id,
    agentType: fila.agentType as ObservacionAgentePersistida["agentType"],
    type: fila.type as ObservacionAgentePersistida["type"],
    severity: fila.severity as ObservacionAgentePersistida["severity"],
    status: fila.status as ObservacionAgentePersistida["status"],
    providerId: fila.providerId,
    providerDocumentId: fila.providerDocumentId,
    organizationId: fila.organizationId,
    paymentTransactionId: fila.paymentTransactionId,
    explanation: fila.explanation,
    evidence: fila.evidence as Record<string, unknown>,
    suggestedAction: fila.suggestedAction,
    source: fila.source,
    confidence: fila.confidence,
    dedupeKey: fila.dedupeKey,
    detectedAt: fila.detectedAt.toISOString(),
    createdAt: fila.createdAt.toISOString(),
    updatedAt: fila.updatedAt.toISOString(),
  };
}

/**
 * Upsert por `dedupeKey` — idempotente: correr el mismo detector dos veces
 * sobre los mismos datos actualiza la fila existente (y la deja `OPEN`,
 * incluso si alguien la hubiera marcado `RESOLVED` a mano — la condición
 * real volvió a ocurrir), nunca duplica.
 */
export async function guardarObservacion(tx: Prisma.TransactionClient, obs: ObservacionAgente): Promise<void> {
  const datosComunes = {
    agentType: obs.agentType,
    type: obs.type,
    severity: obs.severity,
    status: "OPEN" as const,
    providerId: obs.providerId,
    providerDocumentId: obs.providerDocumentId,
    organizationId: obs.organizationId,
    paymentTransactionId: obs.paymentTransactionId,
    explanation: obs.explanation,
    evidence: aJson(obs.evidence),
    suggestedAction: obs.suggestedAction,
    source: obs.source,
    confidence: obs.confidence,
    detectedAt: new Date(obs.detectedAt),
  };

  await tx.agentObservation.upsert({
    where: { dedupeKey: obs.dedupeKey },
    create: { dedupeKey: obs.dedupeKey, ...datosComunes },
    update: datosComunes,
  });
}

/**
 * Marca como `RESOLVED` cualquier observación `OPEN` de este
 * `agentType`+`source` que NO fue re-confirmada en la corrida actual — la
 * condición que la generó ya no se cumple (ej. el documento se renovó).
 * Escritura ÚNICAMENTE sobre la propia tabla de observación del agente —
 * nunca sobre `ProviderDocument` ni ninguna otra tabla de dominio.
 */
export async function resolverObservacionesNoConfirmadas(
  tx: Prisma.TransactionClient,
  agentType: AgentType,
  source: string,
  dedupeKeysVigentes: string[]
): Promise<number> {
  const resultado = await tx.agentObservation.updateMany({
    where: {
      agentType,
      source,
      status: "OPEN",
      dedupeKey: { notIn: dedupeKeysVigentes.length > 0 ? dedupeKeysVigentes : ["__ninguna__"] },
    },
    data: { status: "RESOLVED" },
  });
  return resultado.count;
}

/**
 * Fase 4 Parte E — primera interacción humana (§7 del pedido). Reusa
 * `status` tal cual existe (`OPEN → RESOLVED`) — NO se agregó ningún estado
 * nuevo ("revisada"/"atendida" no existen como valor propio de schema).
 *
 * Seguro por diseño: si la condición que generó la observación TODAVÍA se
 * cumple, la próxima corrida del detector la vuelve a poner en `OPEN`
 * automáticamente (`guardarObservacion` siempre fuerza `status="OPEN"` en
 * cada re-detección) — un humano nunca puede "silenciar" permanentemente
 * algo que sigue siendo cierto. Escritura ÚNICAMENTE sobre la propia fila
 * de `AgentObservation` — nunca sobre `ProviderDocument` ni ninguna otra
 * tabla de dominio.
 */
export async function marcarComoAtendida(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.agentObservation.update({
    where: { id },
    data: { status: "RESOLVED" },
  });
}

export async function obtenerObservacionPorId(tx: Prisma.TransactionClient, id: string): Promise<ObservacionAgentePersistida | null> {
  const fila = await tx.agentObservation.findUnique({ where: { id } });
  return fila ? deFila(fila) : null;
}

export async function listarObservaciones(
  tx: Prisma.TransactionClient,
  opciones: { status?: "OPEN" | "RESOLVED"; agentType?: AgentType } = {}
): Promise<ObservacionAgentePersistida[]> {
  const filas = await tx.agentObservation.findMany({
    where: { status: opciones.status, agentType: opciones.agentType },
    orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
  });
  return filas.map(deFila);
}
