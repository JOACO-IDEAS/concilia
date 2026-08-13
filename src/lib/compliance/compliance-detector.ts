// Fase 4 Parte D — primera encarnación del "Agente de Control Operativo"
// (ver FASE_4_PARTE_D_PLAN.md §3): dominio Compliance, sobre
// Provider/ProviderOrganization/ProviderDocument ya implementados.
//
// Las 3 reglas son 100% DETERMINÍSTICAS — cero LLM, cero interpretación.
// `document.validTo < hoy` es aritmética, no una decisión (Parte F del
// pedido). La única función de este módulo (`ejecutarAgenteDeControlOperativo`)
// LEE Provider/ProviderOrganization/ProviderDocument (vía
// provider-compliance-query.ts) y ESCRIBE únicamente en AgentObservation
// (vía @/lib/agent-os/observation-store.ts) — nunca en ninguna tabla de
// dominio (Provider/ProviderDocument/PaymentTransaction/ReconciliationMatch/
// Obligation/UnitOwner). No ejecuta ninguna acción externa, no envía nada,
// no mueve dinero, no aprueba nada — es "read-only + proposal" de punta a
// punta, tal como exige esta fase.
//
// Deliberadamente NO incluye "documentación faltante según lo que exige la
// normativa" — ver FASE_4_PARTE_D_PLAN.md §4: RegulatoryRequirement sigue
// vacío, y detectar eso sin una fuente legal verificada cargada sería
// inventar un requisito.

import type { Prisma } from "@/generated/prisma/client";
import { calcularEstadoDocumento } from "./document-status";
import { listarProveedoresConDocumentos } from "./provider-compliance-query";
import { guardarObservacion, resolverObservacionesNoConfirmadas } from "@/lib/agent-os/observation-store";
import type { ObservacionAgente } from "@/lib/agent-os/types";

const AGENT_TYPE = "COMPLIANCE" as const;
const SOURCE = "compliance:document-status";

function dedupeKeyDocumento(tipoObservacion: string, documentId: string): string {
  return `${AGENT_TYPE}:${SOURCE}:${tipoObservacion}:doc:${documentId}`;
}
function dedupeKeyProveedor(tipoObservacion: string, providerId: string): string {
  return `${AGENT_TYPE}:${SOURCE}:${tipoObservacion}:provider:${providerId}`;
}

export interface ResultadoDeteccion {
  observacionesGeneradas: number;
  observacionesResueltas: number;
}

export interface OpcionesDeteccion {
  ventanaDiasProximoAVencer?: number;
  ahora?: Date;
}

/**
 * Corre las 3 reglas sobre TODOS los proveedores del padrón (scoped
 * implícitamente por lo que `listarProveedoresConDocumentos` devuelve — no
 * hay forma de que esto toque datos de otro dominio). Idempotente: correr
 * dos veces con los mismos datos deja el mismo resultado (upsert por
 * `dedupeKey`); si una condición deja de cumplirse, la observación
 * correspondiente pasa a `RESOLVED` automáticamente.
 */
export async function ejecutarAgenteDeControlOperativo(
  tx: Prisma.TransactionClient,
  opciones: OpcionesDeteccion = {}
): Promise<ResultadoDeteccion> {
  const ahora = opciones.ahora ?? new Date();
  const proveedores = await listarProveedoresConDocumentos(tx);

  const observaciones: ObservacionAgente[] = [];

  for (const proveedor of proveedores) {
    // Regla C — proveedor sin documentación. Solo aplica a proveedores
    // efectivamente vinculados a alguna organización (un Provider huérfano,
    // sin ninguna ProviderOrganization activa, no es una situación que
    // requiera atención todavía — nadie lo está usando).
    if (proveedor.documents.length === 0) {
      if (proveedor.organizationIds.length === 0) continue;

      observaciones.push({
        agentType: AGENT_TYPE,
        type: "PROVIDER_WITHOUT_DOCUMENTS",
        severity: "WARNING",
        providerId: proveedor.id,
        providerDocumentId: null,
        organizationId: null, // aplica a todas las organizaciones del proveedor, no una puntual
        paymentTransactionId: null, // esta observación no se origina en un pago
        explanation: `El proveedor "${proveedor.name}" no tiene ningún documento cargado — el estado documental no pudo determinarse.`,
        evidence: { providerId: proveedor.id, providerName: proveedor.name, organizationIds: proveedor.organizationIds },
        suggestedAction: "Solicitar al proveedor la documentación correspondiente y cargarla.",
        source: SOURCE,
        confidence: null,
        dedupeKey: dedupeKeyProveedor("PROVIDER_WITHOUT_DOCUMENTS", proveedor.id),
        detectedAt: ahora.toISOString(),
      });
      continue;
    }

    for (const doc of proveedor.documents) {
      const estado = calcularEstadoDocumento(
        { validTo: doc.validTo },
        { ventanaDiasProximoAVencer: opciones.ventanaDiasProximoAVencer, ahora }
      );

      if (estado === "EXPIRED") {
        observaciones.push({
          agentType: AGENT_TYPE,
          type: "DOCUMENT_EXPIRED",
          severity: "CRITICAL",
          providerId: proveedor.id,
          providerDocumentId: doc.id,
          organizationId: doc.organizationId,
          paymentTransactionId: null,
          explanation: `El proveedor "${proveedor.name}" tiene un documento de tipo ${doc.type} vencido.`,
          evidence: {
            documentId: doc.id,
            providerName: proveedor.name,
            type: doc.type,
            validTo: doc.validTo ? doc.validTo.toISOString() : null,
          },
          suggestedAction: `Solicitar la renovación del documento ${doc.type} al proveedor "${proveedor.name}".`,
          source: SOURCE,
          confidence: null,
          dedupeKey: dedupeKeyDocumento("DOCUMENT_EXPIRED", doc.id),
          detectedAt: ahora.toISOString(),
        });
      } else if (estado === "EXPIRING_SOON") {
        const diasParaVencer = doc.validTo ? Math.round((doc.validTo.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24)) : null;
        observaciones.push({
          agentType: AGENT_TYPE,
          type: "DOCUMENT_EXPIRING_SOON",
          severity: "WARNING",
          providerId: proveedor.id,
          providerDocumentId: doc.id,
          organizationId: doc.organizationId,
          paymentTransactionId: null,
          explanation:
            diasParaVencer !== null
              ? `El proveedor "${proveedor.name}" tiene un documento de tipo ${doc.type} que vence en ${diasParaVencer} día${diasParaVencer === 1 ? "" : "s"}.`
              : `El proveedor "${proveedor.name}" tiene un documento de tipo ${doc.type} próximo a vencer.`,
          evidence: {
            documentId: doc.id,
            providerName: proveedor.name,
            type: doc.type,
            validTo: doc.validTo ? doc.validTo.toISOString() : null,
            diasParaVencer,
          },
          suggestedAction: `Anticipar la renovación del documento ${doc.type} del proveedor "${proveedor.name}".`,
          source: SOURCE,
          confidence: null,
          dedupeKey: dedupeKeyDocumento("DOCUMENT_EXPIRING_SOON", doc.id),
          detectedAt: ahora.toISOString(),
        });
      }
      // VALID / SIN_VENCIMIENTO -> no genera ninguna observación (proveedor correctamente documentado)
    }
  }

  for (const obs of observaciones) {
    await guardarObservacion(tx, obs);
  }

  const observacionesResueltas = await resolverObservacionesNoConfirmadas(
    tx,
    AGENT_TYPE,
    SOURCE,
    observaciones.map((o) => o.dedupeKey)
  );

  return { observacionesGeneradas: observaciones.length, observacionesResueltas };
}
