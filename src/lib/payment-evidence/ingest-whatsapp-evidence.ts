// Fase 5.3 — orquestador del "Payment Evidence Loop" para un comprobante
// entrante (hoy simulado — ver types.ts). ORQUESTA, no re-implementa: cada
// paso de cálculo real delega en el motor ya existente, sin tocarlo.
//
// NUNCA asume TELÉFONO = PAGADOR BANCARIO (ver FASE_5_3_DISENO.md Parte 3):
// el teléfono solo ancla una organización candidata y corrobora/contradice
// al candidato que el motor real elige — nunca lo reemplaza, nunca decide
// solo cuál es el titular financiero.

import type { Prisma } from "@/generated/prisma/client";
import { resolverTelefono } from "@/lib/reconciliation/phone-identity";
import { resolverPorCuit } from "./identity-resolution";
import { generarCandidatos } from "@/lib/reconciliation/candidate-generator";
import { evaluarDeterministico, type CandidateEntry } from "@/lib/reconciliation/deterministic-matcher";
import { construirTopCandidates } from "@/lib/reconciliation/match-engine";
import type { Blocker, PhoneResolution } from "@/lib/reconciliation/types";
import { guardarObservacion } from "@/lib/agent-os/observation-store";
import type { ObservacionAgente } from "@/lib/agent-os/types";
import type { CandidatoPropuesto, ComprobanteExtraido, EstadoEvidenciaWhatsApp, ResultadoIngestaEvidencia, WhatsAppInboundMessage } from "./types";

const AGENT_TYPE = "MATCHING" as const;
const SOURCE = "whatsapp:payment-evidence";

/** Organización que el teléfono puede anclar — solo cuando conoce un consorcio único, aunque el titular dentro de él sea ambiguo (AMBIGUOUS_WITHIN_ORG comparte organizationId por definición). */
function organizacionDesdeTelefono(resolucion: PhoneResolution): string | null {
  if (resolucion.case === "SINGLE_CANDIDATE" || resolucion.case === "AMBIGUOUS_WITHIN_ORG") {
    return resolucion.candidates[0]?.organizationId ?? null;
  }
  return null;
}

function candidatoDe(ganador: CandidateEntry): CandidatoPropuesto {
  return {
    unitId: ganador.unitId!,
    unitCode: ganador.unitCode,
    unitOwnerId: ganador.unitOwnerId,
    ownerFullName: ganador.ownerFullName,
    obligationId: ganador.obligationId,
    score: ganador.score,
    tier: ganador.tier,
    signals: ganador.signals,
  };
}

/**
 * Corre el "Payment Evidence Loop" completo para UN comprobante ya
 * extraído: resuelve identidad (teléfono, con CUIT como respaldo), corre el
 * motor de matching REAL sobre la organización resuelta, y cruza el
 * resultado contra la identidad de teléfono para detectar contradicciones.
 * Nunca escribe nada — solo lee y calcula (ver ingest-whatsapp-evidence
 * caller para la persistencia en PaymentNotice/AgentObservation).
 */
export async function evaluarEvidenciaDeComprobante(
  tx: Prisma.TransactionClient,
  telefono: string,
  comprobante: ComprobanteExtraido
): Promise<ResultadoIngestaEvidencia> {
  const resolucionTelefono = await resolverTelefono(tx, telefono);
  const blockersIdentidad: Blocker[] = [];

  if (resolucionTelefono.case === "AMBIGUOUS_WITHIN_ORG" || resolucionTelefono.case === "AMBIGUOUS_ACROSS_ORGS") {
    blockersIdentidad.push({ type: "PHONE_AMBIGUOUS", evidence: resolucionTelefono.evidence });
  }

  let organizationId = organizacionDesdeTelefono(resolucionTelefono);

  // El teléfono no ancló una organización única — intentar por CUIT del
  // comprobante, si lo trajo. Nunca se "adivina" — si tampoco resuelve una
  // única organización, queda sin identidad, honestamente.
  if (!organizationId && comprobante.payerIdentifier) {
    const resolucionCuit = await resolverPorCuit(tx, comprobante.payerIdentifier);
    if (resolucionCuit.case === "SINGLE_CANDIDATE") {
      organizationId = resolucionCuit.candidates[0].organizationId;
    }
  }

  if (!organizationId) {
    return {
      resolucionTelefono,
      comprobante,
      organizationId: null,
      estado: "SIN_IDENTIDAD",
      candidatoPropuesto: null,
      topCandidates: null,
      blockers: [
        ...blockersIdentidad,
        {
          type: "INSUFFICIENT_EVIDENCE",
          evidence: "No se pudo determinar a qué consorcio corresponde este comprobante — el teléfono no está registrado (o es ambiguo) y no hay CUIT que lo identifique.",
        },
      ],
      explicacion: "ConcilIA no tiene suficiente información para identificar a qué consorcio pertenece este comprobante.",
    };
  }

  if (comprobante.amount === null) {
    return {
      resolucionTelefono,
      comprobante,
      organizationId,
      estado: "SIN_IDENTIDAD",
      candidatoPropuesto: null,
      topCandidates: null,
      blockers: [...blockersIdentidad, { type: "INSUFFICIENT_EVIDENCE", evidence: "El comprobante no informó ningún importe — no se puede evaluar contra ninguna obligación." }],
      explicacion: "ConcilIA identificó el consorcio, pero el comprobante no trae un importe extraído para evaluar.",
    };
  }

  // Reutiliza el motor real, sin tocarlo — mismo camino que un
  // PaymentTransaction bancario, con un id sintético (nunca persistido como
  // pago real: candidate-generator/deterministic-matcher no lo escriben en
  // ningún lado, solo lo usan para las consultas de exclusión por rechazo
  // previo/duplicado, que naturalmente no encuentran nada para un id que no
  // existe en PaymentTransaction).
  const universe = await generarCandidatos(tx, organizationId);
  const resultado = await evaluarDeterministico(
    tx,
    {
      id: `whatsapp-evidence:${telefono}:${comprobante.referenceNumber ?? comprobante.transactionDate ?? Date.now()}`,
      amount: comprobante.amount,
      payerIdentifier: comprobante.payerIdentifier,
      concept: comprobante.payerName,
      transactionDate: comprobante.transactionDate ? new Date(comprobante.transactionDate) : null,
      referenceNumber: comprobante.referenceNumber,
    },
    universe,
    {}
  );

  const ganador = resultado.winner;
  const candidatoPropuesto = ganador ? candidatoDe(ganador) : null;
  const topCandidates = construirTopCandidates(resultado.candidates);

  let estado: EstadoEvidenciaWhatsApp = resultado.status;
  const blockers: Blocker[] = [...blockersIdentidad, ...resultado.globalBlockers, ...(ganador?.blockers ?? [])];

  // Cruce de identidad — SOLO quando el teléfono apuntó a UN titular
  // puntual (SINGLE_CANDIDATE): comparar contra el ganador real del motor.
  // Nunca se descarta el candidato del motor por esto — se reporta el
  // conflicto explícitamente y se baja a BLOCKED para que un humano decida
  // (Fase 5.3 §6, Caso 2 — "requiere una política de producto", no una
  // decisión automática).
  let conflictoIdentidad: string | null = null;
  if (resolucionTelefono.case === "SINGLE_CANDIDATE" && ganador && ganador.unitOwnerId !== resolucionTelefono.candidates[0].unitOwnerId) {
    const unidadDelTelefono = universe.units.find((u) => u.id === resolucionTelefono.candidates[0].unitId);
    conflictoIdentidad = `El comprobante fue enviado desde el teléfono asociado a UF ${unidadDelTelefono?.code ?? "desconocida"}, pero el mejor candidato según la evidencia del comprobante es UF ${ganador.unitCode}.`;
    blockers.push({ type: "IDENTITY_CONFLICT", evidence: conflictoIdentidad });
    estado = "BLOCKED";
  }

  const explicacion =
    conflictoIdentidad ??
    (estado === "CANDIDATE"
      ? `ConcilIA encontró un candidato compatible: UF ${candidatoPropuesto?.unitCode}.`
      : estado === "AMBIGUOUS"
        ? "ConcilIA encontró más de un candidato posible para este comprobante."
        : "ConcilIA no pudo proponer un candidato seguro para este comprobante.");

  return { resolucionTelefono, comprobante, organizationId, estado, candidatoPropuesto, topCandidates, blockers, explicacion };
}

function dedupeKeyWhatsApp(externalMessageId: string): string {
  return `${AGENT_TYPE}:${SOURCE}:message:${externalMessageId}`;
}

function extractedDataDe(mensaje: WhatsAppInboundMessage, comprobante: ComprobanteExtraido) {
  // Campos que PaymentNotice no tiene como columna propia — ver
  // FASE_5_3_DISENO.md Parte 2. `externalMessageId` acá adentro es lo que
  // permite la idempotencia de aplicación de abajo.
  return {
    externalMessageId: mensaje.externalMessageId,
    messageType: mensaje.messageType,
    payerIdentifier: comprobante.payerIdentifier,
    payerName: comprobante.payerName,
    currency: comprobante.currency,
    bankOrigin: comprobante.bankOrigin,
    confidenceExtraccion: comprobante.confidenceExtraccion,
  };
}

export interface ResultadoIngestaCompleta {
  resultado: ResultadoIngestaEvidencia;
  paymentNoticeId: string;
  observacionGenerada: boolean;
  yaExistia: boolean; // idempotencia — true si este externalMessageId ya se había procesado
}

/**
 * Punto de entrada completo: evalúa la evidencia (función pura de arriba) Y
 * la persiste — únicamente en `PaymentNotice` (siempre) y, solo para
 * excepciones (nunca CANDIDATE limpio), en `AgentObservation` vía
 * `observation-store.ts` (mismo patrón que `matching-observer.ts`, cero
 * escritura directa a tablas de dominio).
 *
 * Idempotencia — de APLICACIÓN, no de base de datos (ver FASE_5_3_DISENO.md
 * Parte 2, gap reportado explícitamente: `PaymentNotice` no tiene una
 * columna `@unique` para el id externo del mensaje). Se busca un
 * `PaymentNotice` existente con el mismo `phone` + `externalMessageId`
 * (dentro de `extractedData`) antes de crear uno nuevo — si ya existe, NO
 * se crea una fila nueva ni se re-evalúa.
 */
export async function ingestarComprobanteWhatsApp(
  tx: Prisma.TransactionClient,
  mensaje: WhatsAppInboundMessage,
  comprobante: ComprobanteExtraido
): Promise<ResultadoIngestaCompleta> {
  const existentes = await tx.paymentNotice.findMany({ where: { phone: mensaje.phone }, select: { id: true, extractedData: true } });
  const yaExistente = existentes.find((n) => (n.extractedData as { externalMessageId?: string } | null)?.externalMessageId === mensaje.externalMessageId);

  if (yaExistente) {
    // Mismo mensaje ya procesado — se recalcula el resultado (puro, sin
    // side effects) solo para devolverlo, pero NO se vuelve a escribir
    // nada, ni el PaymentNotice ni una AgentObservation nueva.
    const resultado = await evaluarEvidenciaDeComprobante(tx, mensaje.phone, comprobante);
    return { resultado, paymentNoticeId: yaExistente.id, observacionGenerada: false, yaExistia: true };
  }

  const resultado = await evaluarEvidenciaDeComprobante(tx, mensaje.phone, comprobante);

  const status = resultado.estado === "SIN_IDENTIDAD" ? ("EXTRACTED" as const) : ("MATCHED_PENDING" as const);

  const notice = await tx.paymentNotice.create({
    data: {
      organizationId: resultado.organizationId,
      phone: mensaje.phone,
      receivedAt: new Date(mensaje.receivedAt),
      amount: resultado.comprobante.amount,
      claimedDate: resultado.comprobante.transactionDate ? new Date(resultado.comprobante.transactionDate) : null,
      reference: resultado.comprobante.referenceNumber,
      attachmentUrl: mensaje.attachmentUrl,
      extractedText: mensaje.rawText,
      extractedData: extractedDataDe(mensaje, resultado.comprobante),
      status,
      confidence: resultado.candidatoPropuesto?.score ?? null,
      // linkedUnitId/linkedUnitOwnerId/linkedPaymentTransactionId: NUNCA se
      // completan acá — eso implicaría una confirmación que nadie dio.
    },
    select: { id: true },
  });

  let observacionGenerada = false;
  if (resultado.estado !== "CANDIDATE") {
    const tipo = resultado.estado === "AMBIGUOUS" ? ("PAYMENT_MATCH_AMBIGUOUS" as const) : ("PAYMENT_MATCH_BLOCKED" as const);
    const severity = resultado.estado === "AMBIGUOUS" ? ("WARNING" as const) : ("CRITICAL" as const);

    const obs: ObservacionAgente = {
      agentType: AGENT_TYPE,
      type: tipo,
      severity,
      providerId: null,
      providerDocumentId: null,
      organizationId: resultado.organizationId,
      paymentTransactionId: null, // no hay pago bancario todavía — solo un comprobante
      explanation: `Comprobante recibido por WhatsApp. ${resultado.explicacion}`,
      evidence: {
        canal: "whatsapp",
        telefono: mensaje.phone,
        paymentNoticeId: notice.id,
        comprobante: resultado.comprobante,
        resolucionTelefono: resultado.resolucionTelefono,
        candidatoPropuesto: resultado.candidatoPropuesto,
        topCandidates: resultado.topCandidates,
        blockers: resultado.blockers,
      },
      suggestedAction:
        resultado.estado === "SIN_IDENTIDAD"
          ? "Revisar manualmente — no se pudo identificar a qué consorcio corresponde este comprobante."
          : "Revisar manualmente antes de considerar este pago como identificado.",
      source: SOURCE,
      confidence: null,
      dedupeKey: dedupeKeyWhatsApp(mensaje.externalMessageId),
      detectedAt: mensaje.receivedAt,
    };
    await guardarObservacion(tx, obs);
    observacionGenerada = true;
  }

  return { resultado, paymentNoticeId: notice.id, observacionGenerada, yaExistia: false };
}
