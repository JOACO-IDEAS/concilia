export type HumanDecision = "APPROVED" | "REJECTED";
export type AssociationStatus = "OBSERVED" | "DISPUTED" | "REVOKED";

export interface HumanConfirmationSnapshot {
  id: string;
  decision: HumanDecision;
  organizationId: string;
  paymentTransactionId: string;
  unitId: string;
  decidedBy: string | null;
  createdAt: Date;
}

export interface IdentitySignalSnapshot {
  id: string;
  organizationId: string;
  payerId: string | null;
}

export interface PayerSnapshot {
  id: string;
  organizationId: string;
  status: "ACTIVE" | "REVOKED";
}

export interface UnitSnapshot {
  id: string;
  organizationId: string;
  active: boolean;
}

export interface AssociationSnapshot {
  organizationId: string;
  unitId: string;
  signalId: string | null;
  payerId: string | null;
  status: AssociationStatus;
}

export interface HumanConfirmationLearningInput {
  organizationId: string;
  decision: HumanConfirmationSnapshot | null;
  signal: IdentitySignalSnapshot | null;
  payer: PayerSnapshot | null;
  unit: UnitSnapshot | null;
  existingAssociations: readonly AssociationSnapshot[];
}

export interface HumanConfirmationEvidenceIntent {
  subject: { signalId: string; payerId?: never } | { payerId: string; signalId?: never };
  organizationId: string;
  unitId: string;
  administratorId: string;
  effect: "SUPPORT";
  source: "HUMAN_CONFIRMATION";
  reconciliationMatchId: string;
  observedAt: Date;
  reason: "Unidad confirmada explícitamente por un administrador.";
}

export interface HumanConfirmationLearningPlan {
  learned: boolean;
  status: "READY" | "NO_LEARNING" | "PARTIAL";
  intents: HumanConfirmationEvidenceIntent[];
  signalUnitEvidencePlanned: boolean;
  payerUnitEvidencePlanned: boolean;
  explanation: string[];
  provenance: { type: "RECONCILIATION_MATCH_APPROVED"; reconciliationMatchId: string } | null;
}

const REASON = "Unidad confirmada explícitamente por un administrador." as const;

function noLearning(explanation: string): HumanConfirmationLearningPlan {
  return { learned: false, status: "NO_LEARNING", intents: [], signalUnitEvidencePlanned: false, payerUnitEvidencePlanned: false, explanation: [explanation], provenance: null };
}

function associationStatus(input: HumanConfirmationLearningInput, subject: { signalId: string } | { payerId: string }) {
  return input.existingAssociations.find((association) =>
    association.organizationId === input.organizationId && association.unitId === input.unit?.id &&
    ("signalId" in subject ? association.signalId === subject.signalId : association.payerId === subject.payerId)
  )?.status ?? null;
}

/**
 * Pure planner. An APPROVED ReconciliationMatch is the existing authoritative
 * human-confirmation event. The plan contains IDs and structured provenance only;
 * it never copies raw identity data and never persists by itself.
 */
export function planLearningFromHumanConfirmation(input: HumanConfirmationLearningInput): HumanConfirmationLearningPlan {
  const { decision, signal, unit } = input;
  if (
    !decision || !decision.id.trim() || !decision.paymentTransactionId.trim() ||
    !decision.decidedBy?.trim()
  ) return noLearning("Falta provenance humana válida.");
  if (decision.decision !== "APPROVED") return noLearning("Una decisión rechazada no genera soporte histórico.");
  if (Number.isNaN(decision.createdAt.getTime())) return noLearning("La fecha de la decisión humana no es válida.");
  if (!signal?.id.trim() || !unit?.id.trim() || !unit.active) return noLearning("La señal o unidad confirmada no está disponible.");
  if (
    decision.organizationId !== input.organizationId || signal.organizationId !== input.organizationId ||
    unit.organizationId !== input.organizationId || decision.unitId !== unit.id ||
    (input.payer !== null && input.payer.organizationId !== input.organizationId)
  ) return noLearning("Los recursos de la confirmación no pertenecen al mismo tenant.");

  const intents: HumanConfirmationEvidenceIntent[] = [];
  const explanation: string[] = [];
  const common = {
    organizationId: input.organizationId,
    unitId: unit.id,
    administratorId: decision.decidedBy,
    effect: "SUPPORT" as const,
    source: "HUMAN_CONFIRMATION" as const,
    reconciliationMatchId: decision.id,
    observedAt: decision.createdAt,
    reason: REASON,
  };

  const signalStatus = associationStatus(input, { signalId: signal.id });
  if (signalStatus === "REVOKED") {
    explanation.push("La asociación signal-unidad está revocada y no se reactiva sin un evento explícito.");
  } else {
    intents.push({ ...common, subject: { signalId: signal.id } });
    explanation.push(signalStatus === "DISPUTED"
      ? "Se planificó soporte signal-unidad preservando el historial disputado."
      : "Se planificó soporte signal-unidad desde la confirmación humana.");
  }

  const payer = input.payer;
  const validResolvedPayer = signal.payerId !== null && payer !== null && signal.payerId === payer.id && payer.organizationId === input.organizationId && payer.status === "ACTIVE";
  if (validResolvedPayer) {
    const payerStatus = associationStatus(input, { payerId: payer.id });
    if (payerStatus === "REVOKED") {
      explanation.push("La asociación payer-unidad está revocada y no se reactiva sin un evento explícito.");
    } else {
      intents.push({ ...common, subject: { payerId: payer.id } });
      explanation.push(payerStatus === "DISPUTED"
        ? "Se planificó soporte payer-unidad preservando el historial disputado."
        : "Se planificó soporte payer-unidad para el payer activo ya resuelto.");
    }
  } else if (signal.payerId !== null) {
    explanation.push("El payer resuelto no es válido y no genera aprendizaje payer-unidad.");
  }

  const signalPlanned = intents.some((intent) => "signalId" in intent.subject);
  const payerPlanned = intents.some((intent) => "payerId" in intent.subject);
  return {
    learned: intents.length > 0,
    status: intents.length === 0 ? "NO_LEARNING" : signalPlanned && (signal.payerId === null || payerPlanned) ? "READY" : "PARTIAL",
    intents,
    signalUnitEvidencePlanned: signalPlanned,
    payerUnitEvidencePlanned: payerPlanned,
    explanation,
    provenance: { type: "RECONCILIATION_MATCH_APPROVED", reconciliationMatchId: decision.id },
  };
}

export interface HumanConfirmationLearningPort<Result = unknown> {
  record(intent: HumanConfirmationEvidenceIntent): Promise<{ result: Result; idempotent: boolean }>;
}

/** Thin adapter boundary: callers may map each intent to recordPayerUnitEvidence. */
export async function persistHumanConfirmationLearning<Result>(plan: HumanConfirmationLearningPlan, port: HumanConfirmationLearningPort<Result>) {
  if (!plan.learned) return [];
  const results = [];
  for (const intent of plan.intents) results.push(await port.record(intent));
  return results;
}
