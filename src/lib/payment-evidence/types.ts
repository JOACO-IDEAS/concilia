// Fase 5.3 — contratos del "Payment Evidence Loop" para comprobantes
// entrantes (hoy: simulados; a futuro: WhatsApp real). Ver
// FASE_5_3_DISENO.md Parte 2/4 para la justificación completa.
//
// Principio no negociable: separar SIEMPRE lo EXTRAÍDO (dato real que
// vendría del comprobante) de lo INFERIDO (resultado del motor de
// matching) — nunca en el mismo campo, nunca uno reemplaza al otro.

import type { Blocker, PhoneResolution, Signal, Tier, TopCandidateDiagnostico } from "@/lib/reconciliation/types";

/**
 * Lo que un futuro adaptador (WhatsApp Business API u otro canal) entrega
 * al núcleo — el núcleo NUNCA sabe ni le importa de qué canal vino esto.
 * Hoy no existe ningún adaptador real (ver FASE_5_3_DISENO.md Parte 1,
 * punto 9) — esta fase consume este contrato con datos ya armados
 * (simulados en tests/demo), nunca con una integración real.
 */
export interface WhatsAppInboundMessage {
  externalMessageId: string; // id del mensaje en el proveedor — clave de idempotencia
  phone: string; // teléfono de origen, tal como lo entrega el proveedor
  receivedAt: string; // ISO — cuándo llegó el mensaje
  messageType: "image" | "pdf" | "text";
  attachmentUrl: string | null; // dónde vive el archivo original, si hay uno
  rawText: string | null; // texto del mensaje / texto crudo extraído del adjunto
}

/**
 * EXTRAÍDO del comprobante — nunca inferido acá. Todos los campos
 * nullable: nunca se asume que un comprobante trae todo. Hoy no hay ningún
 * OCR/LLM real conectado (ver FASE_5_3_DISENO.md Parte 1) — este objeto se
 * recibe ya armado (de un test, una demo, o a futuro de un extractor real
 * con la misma forma que `ai-parser.ts` ya usa para extractos).
 */
export interface ComprobanteExtraido {
  amount: number | null;
  currency: string | null;
  payerName: string | null;
  payerIdentifier: string | null; // CUIT/CUIL/CBU/alias, tal como aparece
  transactionDate: string | null; // ISO
  referenceNumber: string | null;
  bankOrigin: string | null;
  confidenceExtraccion: number | null; // 0-99 si el extractor lo informa, null si no
}

// Estado local, exclusivo de esta capa — NUNCA el mismo tipo que
// `CandidateStatus` (motor bancario real): un comprobante de WhatsApp puede
// estar en un estado que el motor bancario nunca tiene ("sin ninguna
// identidad resuelta, no se pudo ni intentar el matching").
export type EstadoEvidenciaWhatsApp = "CANDIDATE" | "AMBIGUOUS" | "BLOCKED" | "SIN_IDENTIDAD";

export interface CandidatoPropuesto {
  unitId: string;
  unitCode: string;
  unitOwnerId: string | null;
  ownerFullName: string | null;
  obligationId: string | null;
  score: number;
  tier: Tier | null;
  signals: Signal[];
}

/**
 * Salida del orquestador — INFERIDO, siempre separado de `comprobante`
 * (extraído) y de `resolucionTelefono` (identidad resuelta, no financiera).
 */
export interface ResultadoIngestaEvidencia {
  resolucionTelefono: PhoneResolution;
  comprobante: ComprobanteExtraido;

  organizationId: string | null; // real, resuelto por teléfono o CUIT — nunca inventado
  estado: EstadoEvidenciaWhatsApp;
  candidatoPropuesto: CandidatoPropuesto | null;
  topCandidates: TopCandidateDiagnostico[] | null;
  blockers: Blocker[];
  explicacion: string;
}
