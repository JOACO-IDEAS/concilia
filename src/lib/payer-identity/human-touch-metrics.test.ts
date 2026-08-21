import { describe, expect, it } from "vitest";
import type { UnknownPayerResolution } from "./unknown-payer-resolution";
import { aggregateHumanTouchMetrics, measureHumanTouch } from "./human-touch-metrics";

function resolution(overrides: Partial<UnknownPayerResolution> = {}): UnknownPayerResolution {
  return {
    status: "RESOLVED_CANDIDATE",
    candidates: [{ unitId: "unit-1", unitCode: "1A", obligationId: "ob-1", financialScore: 90, identityMemoryScore: 0, decisionScore: 90, reasons: [], historical: { supportCount: 0, contradictionCount: 0, state: "NONE", sources: [], contribution: 0, disputed: false, revokedIgnored: false, deduplicatedByProvenance: false } }],
    primaryCandidate: null,
    explanation: [],
    requiresConfirmation: true,
    diagnostics: { historyChangedRanking: false, historyRemovedConfirmation: false, historicalConflict: false },
    provenance: { organizationId: "org-secret-not-measured", payerId: "payer-secret-not-measured", signalId: "signal-secret-not-measured", durableCorrelation: true, financialScoring: "EXISTING_MATCHER", historicalMemory: "NONE" },
    ...overrides,
  };
}

function withHistory(overrides: Partial<UnknownPayerResolution> = {}) {
  const base = resolution();
  return resolution({ ...overrides, candidates: [{ ...base.candidates[0], historical: { ...base.candidates[0].historical, state: "OBSERVED", supportCount: 5, contribution: 20 }, identityMemoryScore: 20, decisionScore: 110 }] });
}

describe("human touch case measurement", () => {
  it("resolved con confirmación cuenta como touch elegible y NEW_IDENTITY", () => {
    expect(measureHumanTouch(resolution())).toMatchObject({ eligibleForHTR: true, requiresHumanTouch: true, straightThroughResolution: false, touchReasons: ["NEW_IDENTITY"] });
  });

  it("resolved sin confirmación es straight-through, nunca AUTO", () => {
    const measured = measureHumanTouch(withHistory({ requiresConfirmation: false, diagnostics: { historyChangedRanking: false, historyRemovedConfirmation: true, historicalConflict: false } }));
    expect(measured).toMatchObject({ requiresHumanTouch: false, straightThroughResolution: true, historyRemovedConfirmation: true, touchReasons: [] });
    expect(JSON.stringify(measured)).not.toContain("AUTO");
  });

  it("mide ranking impact y conflicto sin interpretarlos como mejora", () => {
    const measured = measureHumanTouch(withHistory({ status: "AMBIGUOUS", diagnostics: { historyChangedRanking: true, historyRemovedConfirmation: false, historicalConflict: true } }));
    expect(measured).toMatchObject({ historyChangedRanking: true, historicalConflict: true, requiresHumanTouch: true });
    expect(measured.touchReasons).toEqual(expect.arrayContaining(["CANDIDATE_AMBIGUITY", "HISTORICAL_CONFLICT"]));
  });

  it("AMBIGUOUS es elegible y requiere touch", () => {
    expect(measureHumanTouch(resolution({ status: "AMBIGUOUS" }))).toMatchObject({ eligibleForHTR: true, requiresHumanTouch: true });
  });

  it("INSUFFICIENT sólo es elegible cuando conserva candidatos", () => {
    expect(measureHumanTouch(resolution({ status: "INSUFFICIENT_EVIDENCE" }))).toMatchObject({ eligibleForHTR: true, requiresHumanTouch: true, touchReasons: ["INSUFFICIENT_EVIDENCE"] });
    expect(measureHumanTouch(resolution({ status: "INSUFFICIENT_EVIDENCE", candidates: [] }))).toMatchObject({ eligibleForHTR: false, requiresHumanTouch: false });
  });

  it("NO_CANDIDATES queda fuera de HTR pero conserva outcome", () => {
    expect(measureHumanTouch(resolution({ status: "NO_CANDIDATES", candidates: [] }))).toMatchObject({ resolutionStatus: "NO_CANDIDATES", eligibleForHTR: false });
  });

  it("clasifica disputed, contradiction y multi-unit sólo desde facts presentes", () => {
    const base = withHistory();
    const second = { ...base.candidates[0], unitId: "unit-2", historical: { ...base.candidates[0].historical, disputed: true, state: "DISPUTED" as const, contradictionCount: 1 } };
    const measured = measureHumanTouch({ ...base, candidates: [...base.candidates, second], requiresConfirmation: true });
    expect(measured.touchReasons).toEqual(["MULTI_UNIT_HISTORY", "DISPUTED_HISTORY", "HISTORICAL_CONTRADICTION"]);
  });

  it("memoria ausente no genera métricas históricas falsas", () => {
    expect(measureHumanTouch(resolution({ diagnostics: { historyChangedRanking: true, historyRemovedConfirmation: true, historicalConflict: true } }))).toMatchObject({ historyPresent: false, historyChangedRanking: false, historyRemovedConfirmation: false, historicalConflict: false });
  });

  it("no muta el resultado y no incluye IDs ni PII", () => {
    const original = resolution();
    const before = structuredClone(original);
    const measured = measureHumanTouch(original);
    expect(original).toEqual(before);
    expect(JSON.stringify(measured)).not.toMatch(/org-secret|payer-secret|signal-secret|phone|email|cbu|fingerprint/i);
  });
});

describe("human touch aggregate", () => {
  it("calcula HTR, straight-through, lift, ranking, conflicto y outcomes", () => {
    const measurements = [
      measureHumanTouch(resolution()),
      measureHumanTouch(withHistory({ requiresConfirmation: false, diagnostics: { historyChangedRanking: false, historyRemovedConfirmation: true, historicalConflict: false } })),
      measureHumanTouch(withHistory({ status: "AMBIGUOUS", diagnostics: { historyChangedRanking: true, historyRemovedConfirmation: false, historicalConflict: true } })),
      measureHumanTouch(resolution({ status: "NO_CANDIDATES", candidates: [] })),
    ];
    expect(aggregateHumanTouchMetrics(measurements)).toMatchObject({ totalCases: 4, htrEligibleCases: 3, humanTouchCases: 2, humanTouchRate: 2 / 3, straightThroughCases: 1, straightThroughResolutionRate: 1 / 3, casesWithHistoricalEvidence: 2, historicalLiftEligibleCases: 2, historicalLiftCount: 1, historicalLiftRate: 0.5, historyChangedRankingCount: 1, historyChangedRankingRate: 0.5, rankingChangedAndRequiresTouchCount: 1, historicalConflictCount: 1, historicalConflictRate: 0.5, outcomeDistribution: { RESOLVED_CANDIDATE: 2, AMBIGUOUS: 1, INSUFFICIENT_EVIDENCE: 0, NO_CANDIDATES: 1 } });
  });

  it("zero denominators producen null, nunca NaN/Infinity", () => {
    const metrics = aggregateHumanTouchMetrics([]);
    expect(metrics).toMatchObject({ totalCases: 0, humanTouchRate: null, straightThroughResolutionRate: null, historicalLiftRate: null, historyChangedRankingRate: null, historicalConflictRate: null });
    expect(JSON.stringify(metrics)).not.toMatch(/NaN|Infinity/);
  });

  it("cero casos históricos mantiene tasas históricas en null", () => {
    const metrics = aggregateHumanTouchMetrics([measureHumanTouch(resolution())]);
    expect(metrics).toMatchObject({ casesWithHistoricalEvidence: 0, historicalLiftRate: null, historyChangedRankingRate: null, historicalConflictRate: null });
  });

  it("preserva múltiples touch reasons en la distribución", () => {
    const conflict = measureHumanTouch(withHistory({ status: "AMBIGUOUS", diagnostics: { historyChangedRanking: true, historyRemovedConfirmation: false, historicalConflict: true } }));
    const metrics = aggregateHumanTouchMetrics([conflict]);
    expect(metrics.touchReasonDistribution.CANDIDATE_AMBIGUITY).toBe(1);
    expect(metrics.touchReasonDistribution.HISTORICAL_CONFLICT).toBe(1);
  });

  it("es determinístico e independiente del orden", () => {
    const a = measureHumanTouch(resolution());
    const b = measureHumanTouch(withHistory({ requiresConfirmation: false }));
    expect(aggregateHumanTouchMetrics([a, b])).toEqual(aggregateHumanTouchMetrics([b, a]));
  });
});
