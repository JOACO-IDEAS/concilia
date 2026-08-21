/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory Prisma boundary for logical E2E */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, prismaDouble } = vi.hoisted(() => {
  const state = {
    decision: null as any,
    signal: { id: "signal-x", organizationId: "org-a", payerId: null, payer: null, status: undefined },
    associations: [] as any[], events: [] as any[],
  };
  const associationMatches = (row: any, where: any) => row.organizationId === where.organizationId && row.unitId === where.unitId
    && row.payerId === (where.payerId ?? null) && row.signalId === (where.signalId ?? null);
  const tx = {
    organizationAdministrator: { findUnique: vi.fn(async () => ({ administrator: { deletedAt: null }, organization: { deletedAt: null, status: "ACTIVE" } })) },
    unit: { findUnique: vi.fn(async ({ where }: any) => ["unit-2a", "unit-7c"].includes(where.id) ? { id: where.id, organizationId: "org-a", deletedAt: null } : null) },
    payer: { findUnique: vi.fn(async () => null) },
    payerIdentitySignal: { findUnique: vi.fn(async ({ where }: any) => where.id === state.signal.id ? state.signal : null) },
    paymentEvidenceCorrelation: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => [{ paymentNotice: { phone: "+54 11 5555 1234" } }]),
    },
    reconciliationMatch: {
      findFirst: vi.fn(async ({ where }: any) => state.decision?.id === where.id ? state.decision : null),
      findUnique: vi.fn(async ({ where }: any) => state.decision?.id === where.id ? {
        decision: state.decision.decision, unitId: state.decision.unitId, paymentTransactionId: state.decision.paymentTransactionId,
        paymentTransaction: { organizationId: "org-a" },
      } : null),
    },
    payerUnitAssociation: {
      findMany: vi.fn(async ({ where }: any) => state.associations.filter((row) => row.organizationId === where.organizationId && row.unitId === where.unitId && where.OR.some((clause: any) => (clause.signalId && row.signalId === clause.signalId) || (clause.payerId && row.payerId === clause.payerId)))),
      findUnique: vi.fn(async ({ where }: any) => state.associations.find((row) => row.id === where.id) ?? null),
      findFirst: vi.fn(async ({ where }: any) => state.associations.find((row) => associationMatches(row, where)) ?? null),
      create: vi.fn(async ({ data }: any) => { const row = { id: `association-${state.associations.length + 1}`, status: "OBSERVED", observationCount: 0, supportCount: 0, contradictionCount: 0, ...data }; state.associations.push(row); return row; }),
      update: vi.fn(async ({ where, data }: any) => { const row = state.associations.find((item) => item.id === where.id); for (const [key, value] of Object.entries(data)) { if (value && typeof value === "object" && "increment" in value) row[key] += (value as any).increment; else if (value !== undefined) row[key] = value; } return row; }),
    },
    payerUnitEvidenceEvent: {
      findUnique: vi.fn(async ({ where }: any) => state.events.find((row) => row.organizationId === where.organizationId_evidenceKey.organizationId && row.evidenceKey === where.organizationId_evidenceKey.evidenceKey) ?? null),
      create: vi.fn(async ({ data }: any) => { const row = { id: `event-${state.events.length + 1}`, ...data }; state.events.push(row); return row; }),
    },
  };
  const prismaDouble = {
    ...tx,
    payerIdentitySignal: {
      ...tx.payerIdentitySignal,
      findMany: vi.fn(async () => [state.signal]),
    },
    $transaction: vi.fn(async (callback: any) => callback(tx)),
  };
  return { state, prismaDouble };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaDouble }));

const { learnFromPersistedHumanConfirmation } = await import("./human-confirmation-learning-runtime");
const { resolveUnknownPayer } = await import("./unknown-payer-resolution");
const { toReconciliationIntelligenceViewModel } = await import("./reconciliation-intelligence-view-model");
const { measureHumanTouch, aggregateHumanTouchMetrics } = await import("./human-touch-metrics");

const candidate = (unitId: string, score: number) => ({
  unitId, unitCode: unitId === "unit-2a" ? "2A" : "7C", unitOwnerId: null, ownerFullName: null, obligationId: `obligation-${unitId}`,
  score, tier: 2 as const, blockers: [], wouldQualifyForAuto: false,
  signals: [{ signal: "AMOUNT_MATCH" as const, tier: 2 as const, matched: true, strength: "STRONG" as const, evidence: `Importe compatible con ${unitId}.` }],
});
const memoryFromState = () => state.associations.map((association) => ({
  organizationId: association.organizationId, unitId: association.unitId, payerId: association.payerId, signalId: association.signalId,
  status: association.status, supportCount: association.supportCount, contradictionCount: association.contradictionCount,
  evidence: state.events.filter((event) => event.associationId === association.id && (event.effect === "SUPPORT" || event.effect === "CONTRADICT")).map((event) => ({ provenanceKey: event.evidenceKey, effect: event.effect })),
}));
const resolve = (memory: any[], candidates = [candidate("unit-2a", 90)], signalId = "signal-x") => resolveUnknownPayer({
  organizationId: "org-a", payerId: null, signalId, hasDurableCorrelation: true, candidates, memory,
});

beforeEach(() => {
  state.decision = null; state.associations.length = 0; state.events.length = 0;
  state.signal = { id: "signal-x", organizationId: "org-a", payerId: null, payer: null, status: undefined };
  vi.clearAllMocks();
});

describe("Financial Intelligence logical learning loop E2E", () => {
  it("chains first resolution → human confirmation → durable memory → second resolution → HTR", async () => {
    const first = resolve([]);
    expect(first).toMatchObject({ status: "RESOLVED_CANDIDATE", requiresConfirmation: true, diagnostics: { historyRemovedConfirmation: false } });

    state.decision = {
      id: "decision-human-1", decision: "APPROVED", paymentTransactionId: "payment-first", unitId: "unit-2a", decidedBy: "admin-1",
      createdAt: new Date("2026-08-21T12:00:00Z"), paymentTransaction: { organizationId: "org-a" },
      unit: { id: "unit-2a", organizationId: "org-a", deletedAt: null },
    };
    const learned = await learnFromPersistedHumanConfirmation("decision-human-1", "admin-1");
    expect(learned).toMatchObject({ status: "LEARNED", signalEvidence: true, payerEvidence: false, eventsPersisted: 1 });
    expect(state.associations).toEqual([expect.objectContaining({ signalId: "signal-x", unitId: "unit-2a", supportCount: 1 })]);
    expect(state.events).toEqual([expect.objectContaining({ source: "HUMAN_CONFIRMATION", reconciliationMatchId: "decision-human-1", effect: "SUPPORT" })]);

    const second = resolve(memoryFromState());
    expect(second).toMatchObject({ status: "RESOLVED_CANDIDATE", requiresConfirmation: true, diagnostics: { historyRemovedConfirmation: false } });
    expect(second.primaryCandidate).toMatchObject({ unitId: "unit-2a", financialScore: 90, identityMemoryScore: 4, decisionScore: 94, historical: { supportCount: 1 } });
    expect(second.explanation.join(" ")).toContain("soporte histórico activo");

    const viewModel = toReconciliationIntelligenceViewModel(second);
    expect(viewModel).toMatchObject({ status: "RESOLVED_CANDIDATE", requiresConfirmation: true, historicalEvidence: [expect.objectContaining({ status: "match" })] });

    const firstTouch = measureHumanTouch(first);
    const secondTouch = measureHumanTouch(second);
    expect(firstTouch).toMatchObject({ requiresHumanTouch: true, historyPresent: false });
    expect(secondTouch).toMatchObject({ requiresHumanTouch: true, historyPresent: true, historyRemovedConfirmation: false });
    expect(aggregateHumanTouchMetrics([firstTouch, secondTouch])).toMatchObject({ htrEligibleCases: 2, humanTouchCases: 2, humanTouchRate: 1, straightThroughCases: 0, straightThroughResolutionRate: 0, historicalLiftEligibleCases: 1, historicalLiftCount: 0, historicalLiftRate: 0 });

    const replay = await learnFromPersistedHumanConfirmation("decision-human-1", "admin-1");
    expect(replay).toMatchObject({ status: "ALREADY_APPLIED", eventsPersisted: 0, eventsAlreadyApplied: 1 });
    expect(state.associations[0].supportCount).toBe(1);
    expect(state.events).toHaveLength(1);
    expect(resolve(memoryFromState())).toEqual(second);
  });

  it("preserves multi-unit, conflict, disputed, revoked and cross-tenant semantics", () => {
    const base = { organizationId: "org-a", payerId: null, signalId: "signal-x", contradictionCount: 0, evidence: [] };
    const multi = resolve([
      { ...base, unitId: "unit-2a", status: "OBSERVED", supportCount: 3 },
      { ...base, unitId: "unit-7c", status: "OBSERVED", supportCount: 1 },
    ], [candidate("unit-2a", 90), candidate("unit-7c", 60)]);
    expect(multi).toMatchObject({ status: "RESOLVED_CANDIDATE", requiresConfirmation: true });
    const multiView = toReconciliationIntelligenceViewModel(multi);
    expect(multiView).toMatchObject({ multiUnitHistory: true, requiresConfirmation: true });
    expect(multiView.historicalEvidence.some((item) => item.text.includes("varias unidades"))).toBe(true);

    const conflict = resolve([{ ...base, signalId: "signal-y", unitId: "unit-7c", status: "OBSERVED", supportCount: 5 }], [candidate("unit-2a", 90), candidate("unit-7c", 80)], "signal-y");
    expect(conflict).toMatchObject({ status: "AMBIGUOUS", requiresConfirmation: true, diagnostics: { historicalConflict: true } });
    const conflictView = toReconciliationIntelligenceViewModel(conflict);
    expect(conflictView.historicalConflict).toBe(true);
    expect(conflictView.historicalEvidence.some((item) => item.text.includes("no coinciden"))).toBe(true);

    const disputed = resolve([{ ...base, unitId: "unit-2a", status: "DISPUTED", supportCount: 5 }]);
    expect(disputed).toMatchObject({ requiresConfirmation: true, primaryCandidate: { historical: { disputed: true, contribution: 5 } } });

    const revoked = resolve([{ ...base, unitId: "unit-2a", status: "REVOKED", supportCount: 99 }]);
    expect(revoked).toMatchObject({ requiresConfirmation: true, primaryCandidate: { identityMemoryScore: 0, historical: { revokedIgnored: true } } });

    const noHistory = resolve([]);
    const crossTenant = resolve([{ ...base, organizationId: "org-b", unitId: "unit-2a", status: "OBSERVED", supportCount: 99 }]);
    expect(crossTenant).toEqual(noHistory);
  });

  it("progressively crosses the real three-support threshold and reduces human touch", async () => {
    const payments: ReturnType<typeof resolve>[] = [];
    const measurements: ReturnType<typeof measureHumanTouch>[] = [];
    const decisions: any[] = [];

    for (let paymentNumber = 1; paymentNumber <= 4; paymentNumber++) {
      const resolution = resolve(memoryFromState());
      payments.push(resolution);
      measurements.push(measureHumanTouch(resolution));
      if (!resolution.requiresConfirmation) continue;

      const persistedDecision = {
        id: `decision-human-${paymentNumber}`, decision: "APPROVED", paymentTransactionId: `payment-${paymentNumber}`,
        unitId: "unit-2a", decidedBy: "admin-1", createdAt: new Date(`2026-08-${20 + paymentNumber}T12:00:00Z`),
        paymentTransaction: { organizationId: "org-a" }, unit: { id: "unit-2a", organizationId: "org-a", deletedAt: null },
      };
      decisions.push(persistedDecision);
      state.decision = persistedDecision;
      await expect(learnFromPersistedHumanConfirmation(persistedDecision.id, "admin-1")).resolves.toMatchObject({ status: "LEARNED", eventsPersisted: 1 });
    }

    expect(payments.map((payment) => ({
      support: payment.primaryCandidate?.historical.supportCount,
      financial: payment.primaryCandidate?.financialScore,
      historical: payment.primaryCandidate?.identityMemoryScore,
      decision: payment.primaryCandidate?.decisionScore,
      confirmation: payment.requiresConfirmation,
      removed: payment.diagnostics.historyRemovedConfirmation,
    }))).toEqual([
      { support: 0, financial: 90, historical: 0, decision: 90, confirmation: true, removed: false },
      { support: 1, financial: 90, historical: 4, decision: 94, confirmation: true, removed: false },
      { support: 2, financial: 90, historical: 8, decision: 98, confirmation: true, removed: false },
      { support: 3, financial: 90, historical: 12, decision: 102, confirmation: false, removed: true },
    ]);
    expect(state.associations).toEqual([expect.objectContaining({ signalId: "signal-x", unitId: "unit-2a", supportCount: 3, observationCount: 3 })]);
    expect(state.events.map((event) => event.reconciliationMatchId)).toEqual(["decision-human-1", "decision-human-2", "decision-human-3"]);
    expect(payments[1].explanation.join(" ")).toContain("1 soporte histórico activo");
    expect(payments[2].explanation.join(" ")).toContain("2 soportes históricos activos");
    expect(payments[3].explanation.join(" ")).toContain("3 soportes históricos activos");
    expect(JSON.stringify(payments[3])).not.toContain("AUTO");

    const prefixes = measurements.map((_, index) => aggregateHumanTouchMetrics(measurements.slice(0, index + 1)));
    expect(prefixes.map((metrics) => ({ eligible: metrics.htrEligibleCases, touch: metrics.humanTouchCases, htr: metrics.humanTouchRate, straight: metrics.straightThroughResolutionRate, lift: metrics.historicalLiftCount }))).toEqual([
      { eligible: 1, touch: 1, htr: 1, straight: 0, lift: 0 },
      { eligible: 2, touch: 2, htr: 1, straight: 0, lift: 0 },
      { eligible: 3, touch: 3, htr: 1, straight: 0, lift: 0 },
      { eligible: 4, touch: 3, htr: 0.75, straight: 0.25, lift: 1 },
    ]);
    expect(prefixes[3]).toMatchObject({ historicalLiftEligibleCases: 3, historicalLiftCount: 1, historicalLiftRate: 1 / 3 });

    state.decision = decisions[0];
    await expect(learnFromPersistedHumanConfirmation("decision-human-1", "admin-1")).resolves.toMatchObject({ status: "ALREADY_APPLIED", eventsPersisted: 0 });
    expect(state.associations[0].supportCount).toBe(3);
    expect(state.events).toHaveLength(3);

    const cleanMemory = memoryFromState();
    const noHistory = resolve([]);
    expect(noHistory).toMatchObject({ requiresConfirmation: true, primaryCandidate: { financialScore: 90, identityMemoryScore: 0 } });

    const contradicted = resolve(cleanMemory.map((item) => ({ ...item, contradictionCount: 1 })));
    expect(contradicted).toMatchObject({ requiresConfirmation: true, diagnostics: { historyRemovedConfirmation: false }, primaryCandidate: { historical: { contradictionCount: 1 } } });

    const multiUnit = resolve([...cleanMemory, { organizationId: "org-a", unitId: "unit-7c", payerId: null, signalId: "signal-x", status: "OBSERVED", supportCount: 1, contradictionCount: 0, evidence: [] }], [candidate("unit-2a", 90), candidate("unit-7c", 60)]);
    expect(multiUnit).toMatchObject({ requiresConfirmation: true, diagnostics: { historyRemovedConfirmation: false } });
    expect(toReconciliationIntelligenceViewModel(multiUnit).multiUnitHistory).toBe(true);

    const disputed = resolve(cleanMemory.map((item) => ({ ...item, status: "DISPUTED" })));
    expect(disputed).toMatchObject({ requiresConfirmation: true, diagnostics: { historyRemovedConfirmation: false }, primaryCandidate: { historical: { disputed: true, contribution: 3 } } });

    const revoked = resolve(cleanMemory.map((item) => ({ ...item, status: "REVOKED" })));
    expect(revoked).toMatchObject({ requiresConfirmation: true, diagnostics: { historyRemovedConfirmation: false }, primaryCandidate: { identityMemoryScore: 0 } });
    expect(measureHumanTouch(contradicted).historyRemovedConfirmation).toBe(false);
    expect(measureHumanTouch(multiUnit).straightThroughResolution).toBe(false);
    expect(measureHumanTouch(disputed).historyRemovedConfirmation).toBe(false);
    expect(measureHumanTouch(revoked).historyPresent).toBe(false);
  });
});
