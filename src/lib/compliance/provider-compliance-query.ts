// Fase 4 Parte C — capa de LECTURA del dominio Compliance. Diseñada
// explícitamente para que un futuro agente pueda preguntar "¿qué
// documentación tiene este proveedor, y en qué estado está?" sin conocer
// Prisma ni la normativa: recibe ids simples, devuelve DTOs planos con
// `estado` ya calculado (ver document-status.ts).
//
// 100% lectura — ninguna función acá escribe nada, ni siquiera en las
// tablas de Compliance. No hay ComplianceAlert/AgentAction todavía (Fase 4
// Parte C, deliberadamente): esto es la pieza de "detección", no de
// "propuesta" ni "acción" — el pipeline completo (datos → detección →
// propuesta → política → acción → auditoría) queda para una fase futura,
// montada sobre esto.
//
// Mismo patrón que candidate-generator.ts del motor de matching: recibe
// `tx` explícito (nunca importa `@/lib/prisma` directo), scoped siempre por
// los ids que el caller ya resolvió, nunca escanea toda la base.

import type { Prisma } from "@/generated/prisma/client";
import { calcularEstadoDocumento, type EstadoDocumentoCompliance } from "./document-status";

export interface DocumentoConEstado {
  id: string;
  providerId: string;
  providerName: string;
  organizationId: string | null;
  requirementId: string | null;
  type: string;
  status: string;
  validTo: string | null; // ISO — null si no vence
  estado: EstadoDocumentoCompliance;
}

export interface ProveedorDeOrganizacion {
  providerId: string;
  providerName: string;
  taxId: string | null;
  activo: boolean;
}

/**
 * Documentos de UN proveedor. `opciones.organizationId`, si se pasa, incluye
 * tanto los documentos específicos de esa organización como los
 * reutilizables (`organizationId=null`) — nunca los específicos de OTRA
 * organización distinta (aislamiento entre organizaciones).
 */
export async function obtenerDocumentosDeProveedor(
  tx: Prisma.TransactionClient,
  providerId: string,
  opciones: { organizationId?: string; ventanaDiasProximoAVencer?: number; ahora?: Date } = {}
): Promise<DocumentoConEstado[]> {
  const documentos = await tx.providerDocument.findMany({
    where: {
      providerId,
      deletedAt: null,
      ...(opciones.organizationId
        ? { OR: [{ organizationId: null }, { organizationId: opciones.organizationId }] }
        : {}),
    },
    include: { provider: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return documentos.map((d) => ({
    id: d.id,
    providerId: d.providerId,
    providerName: d.provider.name,
    organizationId: d.organizationId,
    requirementId: d.requirementId,
    type: d.type,
    status: d.status,
    validTo: d.validTo ? d.validTo.toISOString() : null,
    estado: calcularEstadoDocumento(
      { validTo: d.validTo },
      { ventanaDiasProximoAVencer: opciones.ventanaDiasProximoAVencer, ahora: opciones.ahora }
    ),
  }));
}

/** Proveedores vinculados a UNA organización puntual — nunca cruza a otras (aislamiento). */
export async function obtenerProveedoresDeOrganizacion(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<ProveedorDeOrganizacion[]> {
  const vinculos = await tx.providerOrganization.findMany({
    where: { organizationId },
    include: { provider: { select: { id: true, name: true, taxId: true } } },
  });

  return vinculos.map((v) => ({
    providerId: v.provider.id,
    providerName: v.provider.name,
    taxId: v.provider.taxId,
    activo: v.activo,
  }));
}

export interface DocumentoDeProveedorParaDeteccion {
  id: string;
  type: string;
  validTo: Date | null;
  organizationId: string | null;
}

export interface ProveedorConDocumentos {
  id: string;
  name: string;
  organizationIds: string[]; // vía ProviderOrganization activo — puede ser más de una (Fase 4 Parte D)
  documents: DocumentoDeProveedorParaDeteccion[];
}

/**
 * Snapshot completo de proveedores + su documentación — pensado para que un
 * detector (ver src/lib/compliance/compliance-detector.ts) recorra TODO el
 * padrón de proveedores en una sola consulta, sin tener que conocer ids de
 * antemano. Sigue siendo 100% lectura.
 */
export async function listarProveedoresConDocumentos(tx: Prisma.TransactionClient): Promise<ProveedorConDocumentos[]> {
  const proveedores = await tx.provider.findMany({
    where: { deletedAt: null },
    include: {
      organizations: { where: { activo: true }, select: { organizationId: true } },
      documents: { where: { deletedAt: null }, select: { id: true, type: true, validTo: true, organizationId: true } },
    },
  });

  return proveedores.map((p) => ({
    id: p.id,
    name: p.name,
    organizationIds: p.organizations.map((o) => o.organizationId),
    documents: p.documents,
  }));
}
