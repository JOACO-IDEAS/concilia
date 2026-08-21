import type { CandidateEntry } from "@/lib/reconciliation/deterministic-matcher";
import { MARGEN_AMBIGUEDAD_ACTUAL } from "@/lib/calibration/config-snapshot";
import { historicalContribution, type HistoricalContribution, type HistoricalUnitMemory } from "./historical-recognition";

export type { HistoricalContribution, HistoricalEvidence, HistoricalUnitMemory, MemoryStatus } from "./historical-recognition";

export type UnknownPayerResolutionStatus =
  | "RESOLVED_CANDIDATE"
  | "AMBIGUOUS"
  | "INSUFFICIENT_EVIDENCE"
  | "NO_CANDIDATES";

export interface UnknownPayerResolutionInput {
  organizationId: string;
  payerId: string | null;
  signalId: string | null;
  hasDurableCorrelation: boolean;
  candidates: readonly CandidateEntry[];
  memory: readonly HistoricalUnitMemory[];
}

export interface ResolutionReason {
  kind: "FINANCIAL" | "CORRELATION" | "HISTORICAL_SUPPORT" | "HISTORICAL_CONTRADICTION" | "HISTORICAL_STATE" | "HISTORICAL_CONFLICT";
  detail: string;
}

export interface UnknownPayerCandidate {
  unitId: string;
  unitCode: string;
  obligationId: string | null;
  financialScore: number;
  historical: HistoricalContribution;
  /** Compatibility alias. The inspectable contribution lives in `historical`. */
  identityMemoryScore: number;
  decisionScore: number;
  reasons: ResolutionReason[];
}

export interface UnknownPayerResolution {
  status: UnknownPayerResolutionStatus;
  candidates: UnknownPayerCandidate[];
  primaryCandidate: UnknownPayerCandidate | null;
  explanation: string[];
  requiresConfirmation: boolean;
  diagnostics: { historyChangedRanking: boolean; historyRemovedConfirmation: boolean; historicalConflict: boolean };
  provenance: {
    organizationId: string;
    payerId: string | null;
    signalId: string | null;
    durableCorrelation: boolean;
    financialScoring: "EXISTING_MATCHER";
    historicalMemory: "PAYER_UNIT_ASSOCIATION" | "SIGNAL_UNIT_ASSOCIATION" | "PAYER_AND_SIGNAL_ASSOCIATIONS" | "NONE";
  };
}

const STRONG_MEMORY_SUPPORT = 3;
const STRONG_FINANCIAL_TIERS = new Set([1, 2]);

function applicableMemory(input: UnknownPayerResolutionInput, unitId: string) {
  return input.memory.filter((item) => item.organizationId === input.organizationId && item.unitId === unitId);
}

function assessMemory(input: UnknownPayerResolutionInput, unitId: string) {
  return historicalContribution(applicableMemory(input, unitId), { organizationId: input.organizationId, signalId: input.signalId, payerId: input.payerId });
}

function reasonsFor(candidate: CandidateEntry, input: UnknownPayerResolutionInput, memory: HistoricalContribution) {
  const reasons: ResolutionReason[] = candidate.signals
    .filter((signal) => signal.matched && signal.evidence.trim())
    .map((signal) => ({ kind: "FINANCIAL" as const, detail: signal.evidence }));
  if (input.hasDurableCorrelation) reasons.push({ kind: "CORRELATION", detail: "El movimiento tiene una correlación durable confirmada." });
  if (memory.supportCount > 0) {
    reasons.push({
      kind: "HISTORICAL_SUPPORT",
      detail: `${memory.supportCount} soporte${memory.supportCount === 1 ? "" : "s"} histórico${memory.supportCount === 1 ? "" : "s"} activo${memory.supportCount === 1 ? "" : "s"}, desde ${memory.sources.join(" + ").toLowerCase()}.`,
    });
  }
  if (memory.contradictionCount > 0) {
    reasons.push({ kind: "HISTORICAL_CONTRADICTION", detail: `${memory.contradictionCount} contradicción${memory.contradictionCount === 1 ? "" : "es"} histórica${memory.contradictionCount === 1 ? "" : "s"} reduce${memory.contradictionCount === 1 ? "" : "n"} el soporte.` });
  }
  if (memory.disputed) reasons.push({ kind: "HISTORICAL_STATE", detail: "La asociación histórica está disputada; su contribución fue degradada." });
  if (memory.revokedIgnored) reasons.push({ kind: "HISTORICAL_STATE", detail: "La evidencia histórica revocada fue ignorada." });
  if (memory.deduplicatedByProvenance) reasons.push({ kind: "HISTORICAL_STATE", detail: "La evidencia payer + signal compartida se contó una sola vez." });
  return reasons;
}

function emptyResult(input: UnknownPayerResolutionInput, status: "NO_CANDIDATES" | "INSUFFICIENT_EVIDENCE", explanation: string): UnknownPayerResolution {
  return {
    status,
    candidates: [],
    primaryCandidate: null,
    explanation: [explanation],
    requiresConfirmation: true,
    diagnostics: { historyChangedRanking: false, historyRemovedConfirmation: false, historicalConflict: false },
    provenance: provenance(input),
  };
}

function provenance(input: UnknownPayerResolutionInput): UnknownPayerResolution["provenance"] {
  return {
    organizationId: input.organizationId,
    payerId: input.payerId,
    signalId: input.signalId,
    durableCorrelation: input.hasDurableCorrelation,
    financialScoring: "EXISTING_MATCHER",
    historicalMemory: input.signalId && input.payerId ? "PAYER_AND_SIGNAL_ASSOCIATIONS" : input.signalId ? "SIGNAL_UNIT_ASSOCIATION" : input.payerId ? "PAYER_UNIT_ASSOCIATION" : "NONE",
  };
}

/** Pure decision layer: consumes matcher output and memory projections; never persists or executes a reconciliation. */
export function resolveUnknownPayer(input: UnknownPayerResolutionInput): UnknownPayerResolution {
  if (!input.organizationId.trim()) throw new Error("organizationId es obligatorio.");
  if (input.candidates.length === 0) return emptyResult(input, "NO_CANDIDATES", "No existen unidades u obligaciones elegibles.");
  if (!input.hasDurableCorrelation) return emptyResult(input, "INSUFFICIENT_EVIDENCE", "No existe una correlación durable que respalde la resolución.");

  // El matcher puede emitir un candidato por titular. Para resolver unidad se conserva
  // únicamente la mejor evaluación real de cada unidad, sin inventar ni recalcularla.
  const bestByUnit = new Map<string, CandidateEntry>();
  for (const candidate of input.candidates) {
    if (!candidate.unitId || candidate.blockers.length > 0) continue;
    const current = bestByUnit.get(candidate.unitId);
    if (!current || candidate.score > current.score) bestByUnit.set(candidate.unitId, candidate);
  }

  const eligible = [...bestByUnit.values()].filter((candidate) => candidate.obligationId !== null && candidate.score > 0);
  const financialRanking = [...eligible].sort((a, b) => b.score - a.score || a.unitId!.localeCompare(b.unitId!));
  const candidates = eligible
    .map((candidate): UnknownPayerCandidate => {
      const memory = assessMemory(input, candidate.unitId!);
      return {
        unitId: candidate.unitId!,
        unitCode: candidate.unitCode,
        obligationId: candidate.obligationId,
        financialScore: candidate.score,
        historical: memory,
        identityMemoryScore: memory.contribution,
        decisionScore: candidate.score + memory.contribution,
        reasons: reasonsFor(candidate, input, memory),
      };
    })
    .sort((a, b) => b.decisionScore - a.decisionScore || b.financialScore - a.financialScore || a.unitId.localeCompare(b.unitId));

  if (candidates.length === 0) return emptyResult(input, "INSUFFICIENT_EVIDENCE", "No hay una obligación compatible respaldada por evidencia financiera.");

  const first = candidates[0];
  const second = candidates[1];
  const financialLeader = financialRanking[0];
  const financialRunnerUp = financialRanking.find((candidate) => candidate.unitId !== financialLeader.unitId && candidate.tier === financialLeader.tier);
  const financiallyAmbiguous = financialRunnerUp !== undefined && financialRunnerUp.score > 0 && financialLeader.score - financialRunnerUp.score <= MARGEN_AMBIGUEDAD_ACTUAL;
  const hasActiveHistory = candidates.some((candidate) => candidate.historical.supportCount > 0 || candidate.historical.contradictionCount > 0);
  const historyChangedRanking = first.unitId !== financialLeader.unitId;
  const financialLeaderStrong = financialLeader.tier !== null && STRONG_FINANCIAL_TIERS.has(financialLeader.tier);
  const historicalConflict = hasActiveHistory && historyChangedRanking && financialLeaderStrong;
  const numericallyAmbiguous = second !== undefined && first.decisionScore - second.decisionScore <= MARGEN_AMBIGUEDAD_ACTUAL;
  const firstOriginal = eligible.find((candidate) => candidate.unitId === first.unitId)!;
  const financialFloorMet = firstOriginal.tier !== null && STRONG_FINANCIAL_TIERS.has(firstOriginal.tier);
  if (hasActiveHistory && first.historical.contribution !== 0 && !financialFloorMet) {
    return {
      status: "INSUFFICIENT_EVIDENCE",
      candidates,
      primaryCandidate: null,
      explanation: ["La memoria histórica aporta evidencia, pero la evidencia financiera no alcanza el piso mínimo para resolver."],
      requiresConfirmation: true,
      diagnostics: { historyChangedRanking, historyRemovedConfirmation: false, historicalConflict },
      provenance: provenance(input),
    };
  }
  const ambiguous = numericallyAmbiguous || financiallyAmbiguous || historicalConflict;
  const supportedUnits = candidates.filter((candidate) => candidate.historical.supportCount > 0).length;
  const cleanStrongHistory = first.historical.supportCount >= STRONG_MEMORY_SUPPORT && first.historical.contradictionCount === 0 && !first.historical.disputed;
  const requiresConfirmation = ambiguous || supportedUnits > 1 || !cleanStrongHistory;
  const historyRemovedConfirmation = !requiresConfirmation && hasActiveHistory;
  if (historicalConflict) first.reasons.push({ kind: "HISTORICAL_CONFLICT", detail: `La evidencia financiera favorece ${financialLeader.unitCode}, mientras la memoria histórica favorece ${first.unitCode}.` });
  return {
    status: ambiguous ? "AMBIGUOUS" : "RESOLVED_CANDIDATE",
    candidates,
    primaryCandidate: ambiguous ? null : first,
    explanation: ambiguous
      ? historicalConflict ? [first.reasons.at(-1)!.detail] : ["Hay más de una unidad plausible; la evidencia disponible no permite elegir una sin confirmación."]
      : first.reasons.map((reason) => reason.detail),
    requiresConfirmation,
    diagnostics: { historyChangedRanking, historyRemovedConfirmation, historicalConflict },
    provenance: provenance(input),
  };
}
