import { describe, expect, it } from "vitest";
import { adaptRuntimeFinancialIntelligence, type RuntimeMemory } from "./runtime-financial-intelligence";

const shadow = {
  candidateUnitId: "unit-a", candidateUnitOwnerId: "owner-a", candidateObligationId: "obl-a",
  score: 80, tier: 2, topCandidates: [
    { unitCode: "A", score: 80, tier: 2, matchedSignals: ["AMOUNT_MATCH"] },
    { unitCode: "B", score: 65, tier: 2, matchedSignals: ["AMOUNT_MATCH"] },
  ],
  signals: [{ signal: "AMOUNT_MATCH", tier: 2, matched: true, strength: "STRONG", evidence: "Importe compatible." }], blockers: [],
};
const units = [
  { id: "unit-a", code: "A", organizationId: "org-1", obligations: [{ id: "obl-a" }] },
  { id: "unit-b", code: "B", organizationId: "org-1", obligations: [{ id: "obl-b" }] },
];
const identity = { id: "signal-1", organizationId: "org-1", payerId: null, payer: null };
const memory = (overrides: Partial<RuntimeMemory> = {}): RuntimeMemory => ({
  organizationId: "org-1", unitId: "unit-a", payerId: null, signalId: "signal-1", status: "OBSERVED",
  supportCount: 3, contradictionCount: 0, events: [], ...overrides,
});
const run = (overrides: Partial<Parameters<typeof adaptRuntimeFinancialIntelligence>[0]> = {}) => adaptRuntimeFinancialIntelligence({
  organizationId: "org-1", shadow, units, identity, hasDurableCorrelation: true, memory: [], ...overrides,
});

describe("runtime financial intelligence adapter", () => {
  it("returns null without a persisted financial evaluation", () => expect(run({ shadow: null })).toBeNull());
  it("financial-only preserves the persisted score", () => expect(run({ identity: null })?.candidates[0].financialScore).toBe(80));
  it("unknown signal consumes signal-unit memory", () => expect(run({ memory: [memory()] })?.candidates[0].historicalContribution).toBe(12));
  it("known active payer consumes independently proven payer memory", () => expect(run({ identity: { ...identity, payerId: "payer-1", payer: { id: "payer-1", organizationId: "org-1", status: "ACTIVE" } }, memory: [memory({ signalId: null, payerId: "payer-1", events: [{ evidenceKey: "independent", effect: "SUPPORT" }] })] })?.candidates[0].historicalContribution).toBe(4));
  it("missing optional payer remains signal-only", () => expect(run({ identity: { ...identity, payerId: "missing", payer: null }, memory: [memory()] })?.candidates[0].historicalContribution).toBe(12));
  it("strong aligned history can remove confirmation", () => expect(run({ memory: [memory()] })?.requiresConfirmation).toBe(false));
  it("historical conflict is surfaced", () => expect(run({ memory: [memory({ unitId: "unit-b", supportCount: 5 })] })?.historicalConflict).toBe(true));
  it("multi-unit signal preserves confirmation", () => expect(run({ memory: [memory(), memory({ unitId: "unit-b" })] })?.requiresConfirmation).toBe(true));
  it("DISPUTED memory is degraded by the domain", () => expect(run({ memory: [memory({ status: "DISPUTED" })] })?.disputedHistory).toBe(true));
  it("REVOKED memory is not support", () => expect(run({ memory: [memory({ status: "REVOKED" })] })?.candidates[0].historicalContribution).toBe(0));
  it("cross-tenant memory never enters the domain", () => expect(run({ memory: [memory({ organizationId: "org-2", supportCount: 99 })] })?.candidates[0].historicalContribution).toBe(0));
  it("cross-tenant identity never enters the domain", () => expect(run({ identity: { ...identity, organizationId: "org-2" }, memory: [memory()] })?.historicalEvidence).toEqual([]));
  it("without durable correlation returns truthful insufficient evidence", () => expect(run({ hasDurableCorrelation: false })?.status).toBe("INSUFFICIENT_EVIDENCE"));
  it("multiple persisted candidates remain available", () => expect(run()?.candidates.map((item) => item.unitCode)).toEqual(["A", "B"]));
  it("an ambiguous obligation is never selected arbitrarily", () => expect(run({ units: [units[0], { ...units[1], obligations: [{ id: "x" }, { id: "y" }] }] })?.candidates.map((item) => item.unitCode)).toEqual(["A"]));
  it("domain parity uses the same historical decision score", () => expect(run({ memory: [memory()] })?.candidates[0].decisionScore).toBe(92));
});
