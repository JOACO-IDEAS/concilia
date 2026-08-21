import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AGENT_CAPABILITIES, getAgentCapability } from "./capability-registry";
import { executeAgentCapability } from "./executor";
import { resolveAgentIntent } from "./intent";

describe("ConcilIA Agent capability boundary", () => {
  it.each(["¿Qué requiere mi atención hoy?", "qué tengo pendiente", "¿Qué tengo que revisar?"])("resolves the supported deterministic intent: %s", (input) => {
    expect(resolveAgentIntent(input)).toBe("TODAY_ATTENTION");
  });

  it("does not pretend to understand unsupported intents", () => expect(resolveAgentIntent("Buscá un comprobante")).toBeNull());

  it("is an explicit allowlist and every current capability is read-only", () => {
    expect(AGENT_CAPABILITIES).toHaveLength(1);
    expect(getAgentCapability("TODAY_ATTENTION")).toMatchObject({ availability: "AVAILABLE", nature: "READ_ONLY", requiresConfirmation: false });
    expect(getAgentCapability("ARBITRARY_CODE")).toBeNull();
  });

  it("executes only the bounded tool context and returns runtime-only presentation", async () => {
    const todayAttention = vi.fn().mockResolvedValue({ message: "Todo al día.", needsDecision: { status: "available", value: 0, capped: false }, needsInformation: { status: "available", value: 0, capped: false } });
    await expect(executeAgentCapability("TODAY_ATTENTION", { todayAttention })).resolves.toMatchObject({ capability: "TODAY_ATTENTION", presentation: { kind: "ATTENTION_SUMMARY" } });
    expect(todayAttention).toHaveBeenCalledOnce();
  });

  it("registry and executor have no Prisma or external model access", () => {
    const registry = readFileSync(new URL("./capability-registry.ts", import.meta.url), "utf8");
    const executor = readFileSync(new URL("./executor.ts", import.meta.url), "utf8");
    expect(`${registry}\n${executor}`).not.toMatch(/@\/lib\/prisma|openai|anthropic|gemini|fetch\(/i);
  });
});
