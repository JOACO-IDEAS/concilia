import type { ResolutionReason, UnknownPayerCandidate, UnknownPayerResolution } from "./unknown-payer-resolution";

export type PresentedEvidence = { text: string; status: "match" | "conflict" | "missing" };

export interface ReconciliationCandidateViewModel {
  unitId: string;
  unitCode: string;
  financialEvidence: PresentedEvidence[];
  historicalEvidence: PresentedEvidence[];
  financialScore: number;
  historicalContribution: number;
  decisionScore: number;
}

export interface ReconciliationIntelligenceViewModel {
  status: UnknownPayerResolution["status"];
  heading: string;
  summary: string;
  confidenceLabel: "Alta confianza" | "Requiere revisión" | "Evidencia insuficiente";
  requiresConfirmation: boolean;
  confirmationMessage: string;
  primaryCandidate: ReconciliationCandidateViewModel | null;
  candidates: ReconciliationCandidateViewModel[];
  financialEvidence: PresentedEvidence[];
  historicalEvidence: PresentedEvidence[];
  historicalConflict: boolean;
  multiUnitHistory: boolean;
  disputedHistory: boolean;
  technicalDetailAvailable: boolean;
}

const FINANCIAL_KINDS = new Set<ResolutionReason["kind"]>(["FINANCIAL", "CORRELATION"]);

function unique(items: PresentedEvidence[]) {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.text) && Boolean(seen.add(item.text)));
}

function presentCandidate(candidate: UnknownPayerCandidate): ReconciliationCandidateViewModel {
  const financialEvidence = unique(candidate.reasons.filter((reason) => FINANCIAL_KINDS.has(reason.kind)).map((reason) => ({ text: reason.detail, status: "match" as const })));
  const historicalEvidence = unique(candidate.reasons.flatMap((reason): PresentedEvidence[] => {
    if (reason.kind === "HISTORICAL_SUPPORT") return [{ text: reason.detail, status: "match" }];
    if (reason.kind === "HISTORICAL_CONTRADICTION" || reason.kind === "HISTORICAL_CONFLICT") return [{ text: reason.detail, status: "conflict" }];
    if (reason.kind === "HISTORICAL_STATE") return [{ text: reason.detail, status: reason.detail.toLowerCase().includes("revocada") ? "missing" : "conflict" }];
    return [];
  }));
  return { unitId: candidate.unitId, unitCode: candidate.unitCode, financialEvidence, historicalEvidence, financialScore: candidate.financialScore, historicalContribution: candidate.historical.contribution, decisionScore: candidate.decisionScore };
}

/** Presentation-only mapping. It never recalculates resolution, ranking or confirmation policy. */
export function toReconciliationIntelligenceViewModel(resolution: Readonly<UnknownPayerResolution>): ReconciliationIntelligenceViewModel {
  const candidates = resolution.candidates.map(presentCandidate);
  const primaryCandidate = resolution.primaryCandidate ? presentCandidate(resolution.primaryCandidate) : null;
  const financialEvidence = unique((primaryCandidate?.financialEvidence ?? candidates.flatMap((candidate) => candidate.financialEvidence)));
  const historicalEvidence = unique((primaryCandidate?.historicalEvidence ?? candidates.flatMap((candidate) => candidate.historicalEvidence)));
  const multiUnitHistory = resolution.candidates.filter((candidate) => candidate.historical.supportCount > 0).length > 1;
  const disputedHistory = resolution.candidates.some((candidate) => candidate.historical.disputed);

  if (multiUnitHistory) historicalEvidence.push({ text: "Este pagador o señal tiene historial con varias unidades.", status: "conflict" });
  if (resolution.diagnostics.historicalConflict && !historicalEvidence.some((item) => item.text.includes("no coinciden"))) {
    historicalEvidence.push({ text: "La evidencia actual y el historial no coinciden.", status: "conflict" });
  }

  const presentation = resolution.status === "RESOLVED_CANDIDATE"
    ? {
        heading: "ConcilIA propone",
        summary: primaryCandidate ? `Unidad ${primaryCandidate.unitCode}` : "Existe un candidato principal.",
        confidenceLabel: resolution.requiresConfirmation ? "Requiere revisión" as const : "Alta confianza" as const,
        confirmationMessage: resolution.requiresConfirmation ? "Necesitamos que confirmes la unidad propuesta." : "No requiere confirmación según la evidencia disponible.",
      }
    : resolution.status === "AMBIGUOUS"
      ? { heading: "Necesitamos tu decisión", summary: `${candidates.length} candidatos requieren comparación.`, confidenceLabel: "Requiere revisión" as const, confirmationMessage: "Elegí la unidad correcta o rechazá los candidatos." }
      : resolution.status === "INSUFFICIENT_EVIDENCE"
        ? { heading: "Falta información para resolver este pago", summary: candidates.length > 0 ? "Hay candidatos para revisar, pero la evidencia no alcanza." : "No hay un candidato accionable con la evidencia disponible.", confidenceLabel: "Evidencia insuficiente" as const, confirmationMessage: candidates.length > 0 ? "Revisá los candidatos antes de decidir." : "Investigá el caso antes de registrar una decisión." }
        : { heading: "No encontramos una unidad compatible", summary: "No existen candidatos elegibles para este pago.", confidenceLabel: "Evidencia insuficiente" as const, confirmationMessage: "No hay una propuesta que confirmar." };

  return {
    status: resolution.status,
    ...presentation,
    requiresConfirmation: resolution.requiresConfirmation,
    primaryCandidate,
    candidates,
    financialEvidence,
    historicalEvidence: unique(historicalEvidence),
    historicalConflict: resolution.diagnostics.historicalConflict,
    multiUnitHistory,
    disputedHistory,
    technicalDetailAvailable: candidates.length > 0,
  };
}
