import { describe, expect, it } from "vitest";
import {
  persistHumanConfirmationLearning,
  planLearningFromHumanConfirmation,
  type HumanConfirmationLearningInput,
} from "./human-confirmation-learning";

function input(overrides: Partial<HumanConfirmationLearningInput> = {}): HumanConfirmationLearningInput {
  return {
    organizationId: "org-1",
    decision: { id: "decision-1", decision: "APPROVED", organizationId: "org-1", paymentTransactionId: "payment-1", unitId: "unit-2a", decidedBy: "admin-1", createdAt: new Date("2026-08-21T12:00:00Z") },
    signal: { id: "signal-1", organizationId: "org-1", payerId: null },
    payer: null,
    unit: { id: "unit-2a", organizationId: "org-1", active: true },
    existingAssociations: [],
    ...overrides,
  };
}

describe("human confirmation learning planner", () => {
  it("unknown signal confirmada genera SUPPORT signal ↔ unit", () => {
    const plan = planLearningFromHumanConfirmation(input());
    expect(plan).toMatchObject({ learned: true, status: "READY", signalUnitEvidencePlanned: true, payerUnitEvidencePlanned: false });
    expect(plan.intents).toEqual([expect.objectContaining({ subject: { signalId: "signal-1" }, effect: "SUPPORT", source: "HUMAN_CONFIRMATION", reconciliationMatchId: "decision-1" })]);
  });

  it("signal resuelta genera soporte signal-unit y payer-unit sin relink", () => {
    const plan = planLearningFromHumanConfirmation(input({ signal: { id: "signal-1", organizationId: "org-1", payerId: "payer-1" }, payer: { id: "payer-1", organizationId: "org-1", status: "ACTIVE" } }));
    expect(plan).toMatchObject({ learned: true, status: "READY", signalUnitEvidencePlanned: true, payerUnitEvidencePlanned: true });
    expect(plan.intents.map((intent) => intent.subject)).toEqual([{ signalId: "signal-1" }, { payerId: "payer-1" }]);
  });

  it("replay conserva claves de provenance y el adapter puede ser idempotente", async () => {
    const plan = planLearningFromHumanConfirmation(input());
    const seen = new Set<string>();
    const port = { async record(intent: (typeof plan.intents)[number]) { const key = `${intent.reconciliationMatchId}:${JSON.stringify(intent.subject)}:${intent.unitId}`; const duplicate = seen.has(key); seen.add(key); return { result: key, idempotent: duplicate }; } };
    expect((await persistHumanConfirmationLearning(plan, port))[0].idempotent).toBe(false);
    expect((await persistHumanConfirmationLearning(plan, port))[0].idempotent).toBe(true);
    expect(seen.size).toBe(1);
  });

  it("preserva multi-unit: una confirmación nueva sólo agrega su intención", () => {
    const plan = planLearningFromHumanConfirmation(input({ existingAssociations: [{ organizationId: "org-1", unitId: "unit-4b", signalId: "signal-1", payerId: null, status: "OBSERVED" }] }));
    expect(plan.intents).toHaveLength(1);
    expect(plan.intents[0]).toMatchObject({ unitId: "unit-2a", subject: { signalId: "signal-1" } });
  });

  it("preserva payer multi-unit sin borrar asociaciones anteriores", () => {
    const plan = planLearningFromHumanConfirmation(input({ signal: { id: "signal-1", organizationId: "org-1", payerId: "payer-1" }, payer: { id: "payer-1", organizationId: "org-1", status: "ACTIVE" }, existingAssociations: [{ organizationId: "org-1", unitId: "unit-7c", signalId: null, payerId: "payer-1", status: "OBSERVED" }] }));
    expect(plan.intents.filter((intent) => "payerId" in intent.subject)).toEqual([expect.objectContaining({ unitId: "unit-2a" })]);
  });

  it("REJECTED no genera SUPPORT ni contradicción inferida", () => {
    const base = input();
    const plan = planLearningFromHumanConfirmation(input({ decision: { ...base.decision!, decision: "REJECTED" } }));
    expect(plan).toMatchObject({ learned: false, intents: [] });
  });

  it("sin decision, actor o fecha válida no aprende", () => {
    expect(planLearningFromHumanConfirmation(input({ decision: null })).learned).toBe(false);
    const base = input().decision!;
    expect(planLearningFromHumanConfirmation(input({ decision: { ...base, decidedBy: null } })).learned).toBe(false);
    expect(planLearningFromHumanConfirmation(input({ decision: { ...base, createdAt: new Date("invalid") } })).learned).toBe(false);
  });

  it.each([
    ["signal", { signal: { id: "signal-1", organizationId: "org-2", payerId: null } }],
    ["unit", { unit: { id: "unit-2a", organizationId: "org-2", active: true } }],
    ["decision", { decision: { ...input().decision!, organizationId: "org-2" } }],
    ["payer", { signal: { id: "signal-1", organizationId: "org-1", payerId: "payer-1" }, payer: { id: "payer-1", organizationId: "org-2", status: "ACTIVE" } }],
  ])("cross-tenant %s falla cerrado sin filtrar datos", (_label, override) => {
    const plan = planLearningFromHumanConfirmation(input(override as Partial<HumanConfirmationLearningInput>));
    expect(plan).toMatchObject({ learned: false, intents: [], explanation: ["Los recursos de la confirmación no pertenecen al mismo tenant."] });
  });

  it("payer inválido deja learning signal-unit como PARTIAL", () => {
    const plan = planLearningFromHumanConfirmation(input({ signal: { id: "signal-1", organizationId: "org-1", payerId: "payer-1" }, payer: { id: "payer-1", organizationId: "org-1", status: "REVOKED" } }));
    expect(plan).toMatchObject({ learned: true, status: "PARTIAL", signalUnitEvidencePlanned: true, payerUnitEvidencePlanned: false });
  });

  it("no reactiva una asociación signal-unit REVOKED", () => {
    const plan = planLearningFromHumanConfirmation(input({ existingAssociations: [{ organizationId: "org-1", unitId: "unit-2a", signalId: "signal-1", payerId: null, status: "REVOKED" }] }));
    expect(plan).toMatchObject({ learned: false, signalUnitEvidencePlanned: false });
    expect(plan.explanation.join(" ")).toContain("no se reactiva");
  });

  it("DISPUTED admite un nuevo evento explícito sin borrar historia", () => {
    const plan = planLearningFromHumanConfirmation(input({ existingAssociations: [{ organizationId: "org-1", unitId: "unit-2a", signalId: "signal-1", payerId: null, status: "DISPUTED" }] }));
    expect(plan).toMatchObject({ learned: true, signalUnitEvidencePlanned: true });
    expect(plan.explanation.join(" ")).toContain("preservando el historial disputado");
  });

  it("usa sólo IDs y provenance estructurada, sin PII", () => {
    const serialized = JSON.stringify(planLearningFromHumanConfirmation(input()));
    expect(serialized).not.toMatch(/phone|email|cbu|fingerprint|bank name/i);
    expect(serialized).toContain("RECONCILIATION_MATCH_APPROVED");
  });
});
