import { describe, expect, it, vi } from "vitest";
import { PaymentEvidenceIntakeAccessError, type registerPaymentEvidenceFromTrustedTransport } from "@/lib/payment-evidence/intake";
import { MAX_EXTRACTION_TEXT } from "@/lib/payment-evidence/extraction-normalizers";
import { receiveWhatsAppEvidence, type NormalizedWhatsAppProviderEvent, type WhatsAppInboundProviderAdapter } from "./evidence-intake-adapter";

const provider: WhatsAppInboundProviderAdapter = {
  provider: "META_CLOUD",
  verify: (_raw, authorization) => authorization.signature === "valid",
  parse: (raw) => JSON.parse(raw),
};

function event(message: NormalizedWhatsAppProviderEvent["message"], overrides: Partial<NormalizedWhatsAppProviderEvent> = {}) {
  return JSON.stringify({ channelReference: "business-channel-a", messageReference: "message-1", receivedAt: "2026-08-22T00:00:00Z", message, ...overrides });
}

function harness() {
  const connections = new Map([["business-channel-a", "org-a"], ["business-channel-b", "org-b"]]);
  const stored = new Map<string, { id: string; command: Record<string, unknown> }>();
  const registrar = vi.fn(async (command, resolveTenant) => {
    const tx = { whatsAppChannelConnection: { findUnique: async ({ where }: { where: { provider_externalChannelReference: { externalChannelReference: string } } }) => {
      const organizationId = connections.get(where.provider_externalChannelReference.externalChannelReference);
      return organizationId ? { status: "ACTIVE", organization: { id: organizationId, status: "ACTIVE", deletedAt: null } } : null;
    } } };
    const tenant = await resolveTenant(tx);
    if (!tenant) throw new PaymentEvidenceIntakeAccessError();
    const key = `${tenant.organizationId}:${command.source}:${command.externalReference}`;
    const existing = stored.get(key);
    if (existing) return { status: "ALREADY_RECEIVED" as const, idempotency: "EXTERNAL_REFERENCE" as const, intake: { id: existing.id, organizationId: tenant.organizationId, source: command.source, evidenceType: command.evidenceType, state: "RECEIVED" as const, receivedAt: command.receivedAt } };
    const id = `intake-${stored.size + 1}`;
    stored.set(key, { id, command });
    return { status: "CREATED" as const, idempotency: "EXTERNAL_REFERENCE" as const, intake: { id, organizationId: tenant.organizationId, source: command.source, evidenceType: command.evidenceType, state: "RECEIVED" as const, receivedAt: command.receivedAt } };
  }) as unknown as typeof registerPaymentEvidenceFromTrustedTransport;
  return { registrar, stored };
}

describe("WhatsApp evidence intake adapter", () => {
  it("maps authenticated text to the canonical intake command", async () => {
    const { registrar, stored } = harness();
    const result = await receiveWhatsAppEvidence(event({ type: "TEXT", text: "Transferencia realizada" }), { signature: "valid" }, provider, registrar);
    expect(result).toMatchObject({ status: "RECEIVED", evidenceType: "TEXT" });
    const command = [...stored.values()][0].command;
    expect(command).toMatchObject({ source: "WHATSAPP", evidenceType: "TEXT", externalReference: "message-1", declaredMimeType: "text/plain" });
    expect(command).not.toHaveProperty("text");
  });

  it("maps image to an opaque pending media reference without OCR", async () => {
    const { registrar, stored } = harness();
    const result = await receiveWhatsAppEvidence(event({ type: "IMAGE", mediaReference: "media-image-1", mimeType: "image/jpeg" }), { signature: "valid" }, provider, registrar);
    expect(result).toMatchObject({ status: "RECEIVED", evidenceType: "IMAGE", mediaMaterialization: "PENDING" });
    expect([...stored.values()][0].command.storageReference).toBe("whatsapp-media:META_CLOUD:media-image-1");
  });

  it("maps a validated PDF document and ignores filenames", async () => {
    const { registrar, stored } = harness();
    const raw = JSON.stringify({ channelReference: "business-channel-a", messageReference: "message-1", receivedAt: "2026-08-22T00:00:00Z", message: { type: "DOCUMENT", mediaReference: "media-pdf-1", mimeType: "application/pdf", filename: "persona-cuit.pdf" } });
    const result = await receiveWhatsAppEvidence(raw, { signature: "valid" }, provider, registrar);
    expect(result).toMatchObject({ status: "RECEIVED", evidenceType: "PDF", mediaMaterialization: "PENDING" });
    expect(JSON.stringify([...stored.values()][0].command)).not.toContain("persona-cuit.pdf");
  });

  it("is idempotent by tenant + WHATSAPP + provider message id", async () => {
    const { registrar, stored } = harness();
    const raw = event({ type: "TEXT", text: "Pago" });
    await expect(receiveWhatsAppEvidence(raw, { signature: "valid" }, provider, registrar)).resolves.toMatchObject({ status: "RECEIVED" });
    await expect(receiveWhatsAppEvidence(raw, { signature: "valid" }, provider, registrar)).resolves.toMatchObject({ status: "ALREADY_RECEIVED" });
    expect(stored.size).toBe(1);
  });

  it("does not collide on the same message id across resolved tenants", async () => {
    const { registrar, stored } = harness();
    await receiveWhatsAppEvidence(event({ type: "TEXT", text: "Pago" }), { signature: "valid" }, provider, registrar);
    await receiveWhatsAppEvidence(event({ type: "TEXT", text: "Pago" }, { channelReference: "business-channel-b" }), { signature: "valid" }, provider, registrar);
    expect(stored.size).toBe(2);
  });

  it("fails closed for an unknown channel", async () => {
    const { registrar, stored } = harness();
    const result = await receiveWhatsAppEvidence(event({ type: "TEXT", text: "Pago" }, { channelReference: "unknown" }), { signature: "valid" }, provider, registrar);
    expect(result).toEqual({ status: "UNKNOWN_CHANNEL" }); expect(stored.size).toBe(0);
  });

  it("rejects invalid authenticity before parsing or persistence", async () => {
    const parse = vi.fn(provider.parse);
    const adapter = { ...provider, parse };
    const { registrar } = harness();
    await expect(receiveWhatsAppEvidence(event({ type: "TEXT", text: "Pago" }), { signature: "invalid" }, adapter, registrar)).resolves.toEqual({ status: "INVALID_SIGNATURE" });
    expect(parse).not.toHaveBeenCalled(); expect(registrar).not.toHaveBeenCalled();
  });

  it("rejects malformed and oversized payloads", async () => {
    const { registrar } = harness();
    await expect(receiveWhatsAppEvidence("not-json", { signature: "valid" }, provider, registrar)).resolves.toEqual({ status: "INVALID_PAYLOAD" });
    await expect(receiveWhatsAppEvidence(event({ type: "TEXT", text: "x".repeat(MAX_EXTRACTION_TEXT + 1) }), { signature: "valid" }, provider, registrar)).resolves.toEqual({ status: "INVALID_PAYLOAD" });
    expect(registrar).not.toHaveBeenCalled();
  });

  it.each([
    { type: "UNSUPPORTED" as const, providerType: "audio" },
    { type: "DOCUMENT" as const, mediaReference: "media-doc", mimeType: "application/zip" },
  ])("returns unsupported without creating fake evidence", async (message) => {
    const { registrar } = harness();
    await expect(receiveWhatsAppEvidence(event(message), { signature: "valid" }, provider, registrar)).resolves.toEqual({ status: "UNSUPPORTED_MESSAGE" });
    expect(registrar).not.toHaveBeenCalled();
  });

  it("does not persist raw phone, provider payload or contact metadata and emits no logs", async () => {
    const { registrar, stored } = harness();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const raw = JSON.stringify({ channelReference: "business-channel-a", messageReference: "message-1", receivedAt: "2026-08-22T00:00:00Z", senderPhone: "+5491112345678", profileName: "Persona", contact: { phone: "+5491112345678" }, message: { type: "TEXT", text: "dato sensible" } });
    await receiveWhatsAppEvidence(raw, { signature: "valid", token: "secret" }, provider, registrar);
    const persisted = JSON.stringify([...stored.values()][0].command);
    expect(persisted).not.toMatch(/5491112345678|Persona|dato sensible|secret/);
    expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    log.mockRestore(); error.mockRestore();
  });

  it("stops at intake without extraction, correlation, inference, outbound or AUTO fields", async () => {
    const { registrar, stored } = harness();
    await receiveWhatsAppEvidence(event({ type: "IMAGE", mediaReference: "media-1", mimeType: "image/png" }), { signature: "valid" }, provider, registrar);
    const persisted = JSON.stringify([...stored.values()][0].command);
    expect(persisted).not.toMatch(/unitId|payerId|paymentTransactionId|correlation|extraction|outbound|AUTO/);
  });
});
