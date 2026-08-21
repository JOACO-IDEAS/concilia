import "server-only";

import { Buffer } from "node:buffer";
import { PaymentEvidenceIntakeAccessError, registerPaymentEvidenceFromTrustedTransport } from "@/lib/payment-evidence/intake";
import { MAX_EXTRACTION_TEXT } from "@/lib/payment-evidence/extraction-normalizers";

export const MAX_WHATSAPP_WEBHOOK_BYTES = 64 * 1024;
const MAX_OPAQUE_REFERENCE = 255;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type NormalizedWhatsAppProviderEvent = {
  channelReference: string;
  messageReference: string;
  receivedAt: string;
  message:
    | { type: "TEXT"; text: string }
    | { type: "IMAGE"; mediaReference: string; mimeType: string }
    | { type: "DOCUMENT"; mediaReference: string; mimeType: string }
    | { type: "UNSUPPORTED"; providerType: string };
};

export interface WhatsAppInboundProviderAdapter {
  readonly provider: "META_CLOUD";
  verify(rawBody: string, authorization: Readonly<Record<string, string | undefined>>): boolean | Promise<boolean>;
  parse(rawBody: string): unknown;
}

export type WhatsAppEvidenceIntakeOutcome = {
  status: "RECEIVED" | "ALREADY_RECEIVED" | "UNSUPPORTED_MESSAGE" | "UNKNOWN_CHANNEL" | "INVALID_SIGNATURE" | "INVALID_PAYLOAD";
  intakeId?: string;
  evidenceType?: "TEXT" | "IMAGE" | "PDF";
  mediaMaterialization?: "PENDING";
};

type IntakeRegistrar = typeof registerPaymentEvidenceFromTrustedTransport;

function opaqueReference(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > MAX_OPAQUE_REFERENCE || /[\u0000-\u001f\u007f]/.test(normalized) || /[/?#\\]/.test(normalized)) return null;
  return normalized;
}

function normalizeEvent(value: unknown): NormalizedWhatsAppProviderEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<NormalizedWhatsAppProviderEvent>;
  const channelReference = opaqueReference(candidate.channelReference);
  const messageReference = opaqueReference(candidate.messageReference);
  if (!channelReference || !messageReference || typeof candidate.receivedAt !== "string" || !candidate.message || typeof candidate.message !== "object") return null;
  const receivedAt = new Date(candidate.receivedAt);
  if (Number.isNaN(receivedAt.getTime())) return null;
  const message = candidate.message as Record<string, unknown>;
  if (message.type === "TEXT") {
    if (typeof message.text !== "string" || !message.text.trim() || message.text.length > MAX_EXTRACTION_TEXT) return null;
    return { channelReference, messageReference, receivedAt: receivedAt.toISOString(), message: { type: "TEXT", text: message.text } };
  }
  if (message.type === "IMAGE" || message.type === "DOCUMENT") {
    const mediaReference = opaqueReference(message.mediaReference);
    if (!mediaReference || typeof message.mimeType !== "string") return null;
    const mimeType = message.mimeType.trim().toLowerCase();
    return { channelReference, messageReference, receivedAt: receivedAt.toISOString(), message: { type: message.type, mediaReference, mimeType } };
  }
  if (message.type === "UNSUPPORTED" && typeof message.providerType === "string") {
    return { channelReference, messageReference, receivedAt: receivedAt.toISOString(), message: { type: "UNSUPPORTED", providerType: message.providerType.slice(0, 32) } };
  }
  return null;
}

function intakeShape(provider: "META_CLOUD", event: NormalizedWhatsAppProviderEvent) {
  if (event.message.type === "UNSUPPORTED") return null;
  if (event.message.type === "DOCUMENT" && event.message.mimeType !== "application/pdf") return null;
  if (event.message.type === "IMAGE" && !IMAGE_MIME_TYPES.has(event.message.mimeType)) return null;
  const evidenceType = event.message.type === "TEXT" ? "TEXT" as const : event.message.type === "IMAGE" ? "IMAGE" as const : "PDF" as const;
  const storageReference = event.message.type === "TEXT" ? null : `whatsapp-media:${provider}:${event.message.mediaReference}`;
  return {
    command: {
      source: "WHATSAPP" as const,
      evidenceType,
      receivedAt: new Date(event.receivedAt),
      externalReference: event.messageReference,
      storageReference,
      declaredMimeType: event.message.type === "TEXT" ? "text/plain" : event.message.mimeType,
    },
    evidenceType,
    mediaMaterialization: event.message.type === "TEXT" ? undefined : "PENDING" as const,
  };
}

/**
 * Provider-neutral authenticated boundary. The injected provider adapter owns
 * signature verification and payload parsing; only this normalized contract
 * reaches the canonical intake service.
 */
export async function receiveWhatsAppEvidence(
  rawBody: string,
  authorization: Readonly<Record<string, string | undefined>>,
  providerAdapter: WhatsAppInboundProviderAdapter,
  registrar: IntakeRegistrar = registerPaymentEvidenceFromTrustedTransport,
): Promise<WhatsAppEvidenceIntakeOutcome> {
  if (typeof rawBody !== "string" || Buffer.byteLength(rawBody, "utf8") > MAX_WHATSAPP_WEBHOOK_BYTES) return { status: "INVALID_PAYLOAD" };
  let verified = false;
  try { verified = await providerAdapter.verify(rawBody, authorization); } catch { verified = false; }
  if (!verified) return { status: "INVALID_SIGNATURE" };

  let parsed: unknown;
  try { parsed = providerAdapter.parse(rawBody); } catch { return { status: "INVALID_PAYLOAD" }; }
  const event = normalizeEvent(parsed);
  if (!event) return { status: "INVALID_PAYLOAD" };
  const shaped = intakeShape(providerAdapter.provider, event);
  if (!shaped) return { status: "UNSUPPORTED_MESSAGE" };

  try {
    const result = await registrar(shaped.command, async (tx) => {
      const connection = await tx.whatsAppChannelConnection.findUnique({
        where: { provider_externalChannelReference: { provider: providerAdapter.provider, externalChannelReference: event.channelReference } },
        select: { status: true, organization: { select: { id: true, status: true, deletedAt: true } } },
      });
      if (!connection || connection.status !== "ACTIVE" || connection.organization.status !== "ACTIVE" || connection.organization.deletedAt) return null;
      return { organizationId: connection.organization.id };
    });
    return {
      status: result.status === "CREATED" ? "RECEIVED" : "ALREADY_RECEIVED",
      intakeId: result.intake.id,
      evidenceType: shaped.evidenceType,
      mediaMaterialization: shaped.mediaMaterialization,
    };
  } catch (error) {
    if (error instanceof PaymentEvidenceIntakeAccessError) return { status: "UNKNOWN_CHANNEL" };
    return { status: "INVALID_PAYLOAD" };
  }
}
