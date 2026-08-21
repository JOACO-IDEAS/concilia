import type { UnknownPayerResolution, UnknownPayerResolutionStatus } from "./unknown-payer-resolution";

export type HumanTouchReason =
  | "NEW_IDENTITY"
  | "CANDIDATE_AMBIGUITY"
  | "MULTI_UNIT_HISTORY"
  | "DISPUTED_HISTORY"
  | "HISTORICAL_CONTRADICTION"
  | "HISTORICAL_CONFLICT"
  | "INSUFFICIENT_EVIDENCE"
  | "OTHER_BLOCKER";

export interface HumanTouchMeasurement {
  resolutionStatus: UnknownPayerResolutionStatus;
  eligibleForHTR: boolean;
  requiresHumanTouch: boolean;
  straightThroughResolution: boolean;
  historyPresent: boolean;
  historyChangedRanking: boolean;
  historyRemovedConfirmation: boolean;
  historicalConflict: boolean;
  touchReasons: HumanTouchReason[];
}

export interface HumanTouchMetrics {
  totalCases: number;
  htrEligibleCases: number;
  humanTouchCases: number;
  humanTouchRate: number | null;
  straightThroughCases: number;
  straightThroughResolutionRate: number | null;
  casesWithHistoricalEvidence: number;
  historicalLiftEligibleCases: number;
  historicalLiftCount: number;
  historicalLiftRate: number | null;
  historyChangedRankingCount: number;
  historyChangedRankingRate: number | null;
  rankingChangedAndResolvedCount: number;
  rankingChangedAndRequiresTouchCount: number;
  historicalConflictCount: number;
  historicalConflictRate: number | null;
  outcomeDistribution: Record<UnknownPayerResolutionStatus, number>;
  touchReasonDistribution: Record<HumanTouchReason, number>;
}

const OUTCOMES: UnknownPayerResolutionStatus[] = ["RESOLVED_CANDIDATE", "AMBIGUOUS", "INSUFFICIENT_EVIDENCE", "NO_CANDIDATES"];
const TOUCH_REASONS: HumanTouchReason[] = ["NEW_IDENTITY", "CANDIDATE_AMBIGUITY", "MULTI_UNIT_HISTORY", "DISPUTED_HISTORY", "HISTORICAL_CONTRADICTION", "HISTORICAL_CONFLICT", "INSUFFICIENT_EVIDENCE", "OTHER_BLOCKER"];

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

/**
 * HTR eligibility means the resolution retained at least one candidate a human
 * can act on. NO_CANDIDATES and candidate-less INSUFFICIENT_EVIDENCE remain in
 * outcome distribution but do not distort the human-confirmation denominator.
 */
export function measureHumanTouch(resolution: Readonly<UnknownPayerResolution>): HumanTouchMeasurement {
  const eligibleForHTR = resolution.status === "RESOLVED_CANDIDATE" || resolution.status === "AMBIGUOUS" ||
    (resolution.status === "INSUFFICIENT_EVIDENCE" && resolution.candidates.length > 0);
  const requiresHumanTouch = eligibleForHTR && (resolution.requiresConfirmation || resolution.status !== "RESOLVED_CANDIDATE");
  const straightThroughResolution = eligibleForHTR && resolution.status === "RESOLVED_CANDIDATE" && !resolution.requiresConfirmation;
  const histories = resolution.candidates.map((candidate) => candidate.historical);
  const historyPresent = histories.some((history) => history.state !== "NONE" && (history.supportCount > 0 || history.contradictionCount > 0));
  const historyChangedRanking = historyPresent && resolution.diagnostics.historyChangedRanking;
  const historyRemovedConfirmation = historyPresent && resolution.diagnostics.historyRemovedConfirmation;
  const historicalConflict = historyPresent && resolution.diagnostics.historicalConflict;
  const touchReasons: HumanTouchReason[] = [];

  if (requiresHumanTouch) {
    if (!historyPresent && resolution.status === "RESOLVED_CANDIDATE") touchReasons.push("NEW_IDENTITY");
    if (resolution.status === "AMBIGUOUS") touchReasons.push("CANDIDATE_AMBIGUITY");
    if (histories.filter((history) => history.supportCount > 0).length > 1) touchReasons.push("MULTI_UNIT_HISTORY");
    if (histories.some((history) => history.disputed)) touchReasons.push("DISPUTED_HISTORY");
    if (histories.some((history) => history.contradictionCount > 0)) touchReasons.push("HISTORICAL_CONTRADICTION");
    if (historicalConflict) touchReasons.push("HISTORICAL_CONFLICT");
    if (resolution.status === "INSUFFICIENT_EVIDENCE") touchReasons.push("INSUFFICIENT_EVIDENCE");
    if (touchReasons.length === 0) touchReasons.push("OTHER_BLOCKER");
  }

  return {
    resolutionStatus: resolution.status,
    eligibleForHTR,
    requiresHumanTouch,
    straightThroughResolution,
    historyPresent,
    historyChangedRanking,
    historyRemovedConfirmation,
    historicalConflict,
    touchReasons,
  };
}

export function aggregateHumanTouchMetrics(measurements: readonly HumanTouchMeasurement[]): HumanTouchMetrics {
  const outcomeDistribution = Object.fromEntries(OUTCOMES.map((status) => [status, 0])) as Record<UnknownPayerResolutionStatus, number>;
  const touchReasonDistribution = Object.fromEntries(TOUCH_REASONS.map((reason) => [reason, 0])) as Record<HumanTouchReason, number>;
  let htrEligibleCases = 0;
  let humanTouchCases = 0;
  let straightThroughCases = 0;
  let casesWithHistoricalEvidence = 0;
  let historicalLiftEligibleCases = 0;
  let historicalLiftCount = 0;
  let historyChangedRankingCount = 0;
  let rankingChangedAndResolvedCount = 0;
  let rankingChangedAndRequiresTouchCount = 0;
  let historicalConflictCount = 0;

  for (const measurement of measurements) {
    outcomeDistribution[measurement.resolutionStatus]++;
    if (measurement.eligibleForHTR) htrEligibleCases++;
    if (measurement.requiresHumanTouch) humanTouchCases++;
    if (measurement.straightThroughResolution) straightThroughCases++;
    if (measurement.historyPresent) {
      casesWithHistoricalEvidence++;
      if (measurement.eligibleForHTR) historicalLiftEligibleCases++;
      if (measurement.historyChangedRanking) historyChangedRankingCount++;
      if (measurement.historicalConflict) historicalConflictCount++;
    }
    if (measurement.historyRemovedConfirmation && measurement.historyPresent && measurement.eligibleForHTR) historicalLiftCount++;
    if (measurement.historyChangedRanking) {
      if (measurement.resolutionStatus === "RESOLVED_CANDIDATE") rankingChangedAndResolvedCount++;
      if (measurement.requiresHumanTouch) rankingChangedAndRequiresTouchCount++;
    }
    for (const reason of measurement.touchReasons) touchReasonDistribution[reason]++;
  }

  return {
    totalCases: measurements.length,
    htrEligibleCases,
    humanTouchCases,
    humanTouchRate: ratio(humanTouchCases, htrEligibleCases),
    straightThroughCases,
    straightThroughResolutionRate: ratio(straightThroughCases, htrEligibleCases),
    casesWithHistoricalEvidence,
    historicalLiftEligibleCases,
    historicalLiftCount,
    historicalLiftRate: ratio(historicalLiftCount, historicalLiftEligibleCases),
    historyChangedRankingCount,
    historyChangedRankingRate: ratio(historyChangedRankingCount, casesWithHistoricalEvidence),
    rankingChangedAndResolvedCount,
    rankingChangedAndRequiresTouchCount,
    historicalConflictCount,
    historicalConflictRate: ratio(historicalConflictCount, casesWithHistoricalEvidence),
    outcomeDistribution,
    touchReasonDistribution,
  };
}
