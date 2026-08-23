import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AGENT_CAPABILITIES, getAgentCapability } from "./capability-registry";
import { executeAgentCapability } from "./executor";
import { resolveAgentIntent } from "./intent";

describe("ConcilIA Agent capability boundary", () => {
  it.each(["¿Qué requiere mi atención hoy?", "qué tengo pendiente", "¿Qué tengo que revisar?"])("resolves the supported deterministic intent: %s", (input) => {
    expect(resolveAgentIntent(input)).toMatchObject({ capability: "TODAY_ATTENTION" });
  });

  it("does not pretend to understand unsupported intents", () => expect(resolveAgentIntent("Buscá un comprobante")).toBeNull());

  it("is an explicit allowlist and every current capability is read-only", () => {
    expect(AGENT_CAPABILITIES).toHaveLength(6);
    expect(AGENT_CAPABILITIES.every((item) => item.nature === "READ_ONLY" && item.requiresConfirmation === false && item.inputSchema && item.outputSchema)).toBe(true);
    expect(getAgentCapability("TODAY_ATTENTION")).toMatchObject({ availability: "AVAILABLE", nature: "READ_ONLY", requiresConfirmation: false });
    expect(getAgentCapability("ARBITRARY_CODE")).toBeNull();
  });

  it("executes only the bounded tool context and returns runtime-only presentation", async () => {
    const todayAttention = vi.fn().mockResolvedValue({ message: "Todo al día.", needsDecision: { status: "available", value: 0, capped: false }, needsInformation: { status: "available", value: 0, capped: false } });
    const unused = vi.fn();
    await expect(executeAgentCapability("TODAY_ATTENTION", {}, { todayAttention, reconciliationReview: unused, debtOverview: unused, reconciliationLookup: unused, organizationLookup: unused })).resolves.toMatchObject({ capability: "TODAY_ATTENTION", presentation: { kind: "ATTENTION_SUMMARY" } });
    expect(todayAttention).toHaveBeenCalledOnce();
  });

  it.each([
    ["¿Qué pagos necesitan revisión?", "RECONCILIATION_REVIEW"],
    ["¿Dónde tengo mayor mora?", "DEBT_OVERVIEW"],
    ["¿Qué pasó con el pago de $210.000?", "RECONCILIATION_LOOKUP"],
    ["Mostrame Santa Fe 1842", "ORGANIZATION_LOOKUP"],
  ])("maps %s conservatively", (message, capability) => expect(resolveAgentIntent(message)).toMatchObject({ capability }));

  it("routes bounded document intents and keeps ambiguous payments unsupported", () => {
    expect(resolveAgentIntent("mostrame la factura de Acme de 2026-08")).toMatchObject({ capability: "DOCUMENT_LOOKUP", input: { documentType: "INVOICE", provider: "acme", period: "2026-08" } });
    expect(resolveAgentIntent("pago")).toBeNull();
  });

  it("exposes a strict, read-only document lookup schema", () => {
    const document = getAgentCapability("DOCUMENT_LOOKUP")!;
    expect(document).toMatchObject({ availability: "AVAILABLE", nature: "READ_ONLY", requiresConfirmation: false });
    expect(document.modelInputSchema.additionalProperties).toBe(false);
    expect(document.modelInputSchema.required).toEqual(["organization", "documentType", "provider", "period", "amount", "expiresFrom", "expiresTo"]);
  });

  it("registry and executor have no Prisma or external model access", () => {
    const registry = readFileSync(new URL("./capability-registry.ts", import.meta.url), "utf8");
    const executor = readFileSync(new URL("./executor.ts", import.meta.url), "utf8");
    expect(`${registry}\n${executor}`).not.toMatch(/@\/lib\/prisma|openai|anthropic|gemini|fetch\(/i);
  });
});
