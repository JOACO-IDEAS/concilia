import type { CandidateEntry } from "@/lib/reconciliation/deterministic-matcher";

export type UnknownPayerResolutionStatus =
  | "RESOLVED_CANDIDATE"
  | "AMBIGUOUS"
  | "INSUFFICIENT_EVIDENCE"
  | "NO_CANDIDATES";

export type MemoryStatus = "OBSERVED" | "DISPUTED" | "REVOKED";

export interface HistoricalUnitMemory {
  organizationId: string;
  unitId: string;
  payerId: string | null;
  signalId: string | null;
  status: MemoryStatus;
  supportCount: number;
  contradictionCount: number;
}

export interface UnknownPayerResolutionInput {
  organizationId: string;
  payerId: string | null;
  signalId: string | null;
  hasDurableCorrelation: boolean;
  candidates: readonly CandidateEntry[];
  memory: readonly HistoricalUnitMemory[];
}

export interface ResolutionReason {
  kind: "FINANCIAL" | "CORRELATION" | "HISTORICAL_SUPPORT" | "HISTORICAL_CONTRADICTION";
  detail: string;
}

export interface UnknownPayerCandidate {
  unitId: string;
  unitCode: string;
  obligationId: string | null;
  financialScore: number;
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
  provenance: {
    organizationId: string;
    payerId: string | null;
    signalId: string | null;
    durableCorrelation: boolean;
    financialScoring: "EXISTING_MATCHER";
    historicalMemory: "PAYER_UNIT_ASSOCIATION" | "SIGNAL_UNIT_ASSOCIATION" | "NONE";
  };
}

const AMBIGUITY_MARGIN = 10;
const STRONG_MEMORY_SUPPORT = 3;

function applicableMemory(input: UnknownPayerResolutionInput, unitId: string) {
  return input.memory.filter((item) => {
    if (item.organizationId !== input.organizationId || item.unitId !== unitId || item.status === "REVOKED") return false;
    if (input.signalId) return item.signalId === input.signalId;
    return input.payerId !== null && item.payerId === input.payerId;
  });
}

function assessMemory(items: readonly HistoricalUnitMemory[]) {
  let support = 0;
  let contradiction = 0;
  let disputed = false;
  for (const item of items) {
    support += Math.max(0, item.supportCount);
    contradiction += Math.max(0, item.contradictionCount);
    disputed ||= item.status === "DISPUTED";
  }
  const raw = Math.max(-20, Math.min(20, support * 4 - contradiction * 6));
  return { support, contradiction, disputed, score: disputed ? Math.trunc(raw / 4) : raw };
}

function reasonsFor(candidate: CandidateEntry, input: UnknownPayerResolutionInput, memory: ReturnType<typeof assessMemory>) {
  const reasons: ResolutionReason[] = candidate.signals
    .filter((signal) => signal.matched)
    .map((signal) => ({ kind: "FINANCIAL" as const, detail: signal.evidence }));
  if (input.hasDurableCorrelation) reasons.push({ kind: "CORRELATION", detail: "El movimiento tiene una correlación durable confirmada." });
  if (memory.support > 0) {
    reasons.push({
      kind: "HISTORICAL_SUPPORT",
      detail: `${memory.support} evidencia${memory.support === 1 ? "" : "s"} histórica${memory.support === 1 ? "" : "s"} activa${memory.support === 1 ? "" : "s"}${memory.disputed ? " (asociación disputada; peso reducido)" : ""}.`,
    });
  }
  if (memory.contradiction > 0) {
    reasons.push({ kind: "HISTORICAL_CONTRADICTION", detail: `${memory.contradiction} contradicción${memory.contradiction === 1 ? "" : "es"} histórica${memory.contradiction === 1 ? "" : "s"} activa${memory.disputed ? "; asociación disputada" : ""}.` });
  }
  return reasons;
}

function emptyResult(input: UnknownPayerResolutionInput, status: "NO_CANDIDATES" | "INSUFFICIENT_EVIDENCE", explanation: string): UnknownPayerResolution {
  return {
    status,
    candidates: [],
    primaryCandidate: null,
    explanation: [explanation],
    requiresConfirmation: true,
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
    historicalMemory: input.signalId ? "SIGNAL_UNIT_ASSOCIATION" : input.payerId ? "PAYER_UNIT_ASSOCIATION" : "NONE",
  };
}

/** Pure decision layer: consumes matcher output and memory projections; never persists or executes a reconciliation. */
export function resolveUnknownPayer(input: UnknownPayerResolutionInput): UnknownPayerResolution {
  if (!input.organizationId.trim()) throw new Error("organizationId es obligatorio.");
  if (input.payerId && input.signalId) throw new Error("La resolución acepta payerId o signalId, no ambos.");
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

  const candidates = [...bestByUnit.values()]
    .filter((candidate) => candidate.obligationId !== null && candidate.score > 0)
    .map((candidate): UnknownPayerCandidate => {
      const memory = assessMemory(applicableMemory(input, candidate.unitId!));
      return {
        unitId: candidate.unitId!,
        unitCode: candidate.unitCode,
        obligationId: candidate.obligationId,
        financialScore: candidate.score,
        identityMemoryScore: memory.score,
        decisionScore: candidate.score + memory.score,
        reasons: reasonsFor(candidate, input, memory),
      };
    })
    .sort((a, b) => b.decisionScore - a.decisionScore || b.financialScore - a.financialScore || a.unitId.localeCompare(b.unitId));

  if (candidates.length === 0) return emptyResult(input, "INSUFFICIENT_EVIDENCE", "No hay una obligación compatible respaldada por evidencia financiera.");

  const first = candidates[0];
  const second = candidates[1];
  const ambiguous = second !== undefined && first.decisionScore - second.decisionScore <= AMBIGUITY_MARGIN;
  const firstMemory = assessMemory(applicableMemory(input, first.unitId));
  const historicallySupportedUnits = new Set(
    input.memory
      .filter((item) => item.organizationId === input.organizationId && item.status !== "REVOKED" && item.supportCount > 0)
      .filter((item) => input.signalId ? item.signalId === input.signalId : input.payerId !== null && item.payerId === input.payerId)
      .map((item) => item.unitId)
  );
  const requiresConfirmation = ambiguous || historicallySupportedUnits.size > 1 || firstMemory.disputed || firstMemory.contradiction > 0 || firstMemory.support < STRONG_MEMORY_SUPPORT;
  return {
    status: ambiguous ? "AMBIGUOUS" : "RESOLVED_CANDIDATE",
    candidates,
    primaryCandidate: ambiguous ? null : first,
    explanation: ambiguous
      ? ["Hay más de una unidad plausible; la evidencia disponible no permite elegir una sin confirmación."]
      : first.reasons.map((reason) => reason.detail),
    requiresConfirmation,
    provenance: provenance(input),
  };
}
