import "server-only";

import { prisma } from "@/lib/prisma";
import { planLearningFromHumanConfirmation, persistHumanConfirmationLearning } from "./human-confirmation-learning";
import { identityFingerprintsForNoticePhones } from "./runtime-financial-intelligence";
import { recordPayerUnitEvidence } from "./unit-memory";

export type RuntimeLearningResult = {
  status: "LEARNED" | "ALREADY_APPLIED" | "PARTIAL" | "NO_SIGNAL" | "AMBIGUOUS_SIGNAL" | "SKIPPED_BY_POLICY";
  signalEvidence: boolean;
  payerEvidence: boolean;
  eventsPersisted: number;
  eventsAlreadyApplied: number;
};

const empty = (status: RuntimeLearningResult["status"]): RuntimeLearningResult => ({
  status, signalEvidence: false, payerEvidence: false, eventsPersisted: 0, eventsAlreadyApplied: 0,
});

/**
 * Processes one durable human decision. The decision is never created here:
 * callers invoke this only after their ReconciliationMatch transaction commits.
 */
export async function learnFromPersistedHumanConfirmation(decisionId: string, requestingAdministratorId: string): Promise<RuntimeLearningResult> {
  const decision = await prisma.reconciliationMatch.findFirst({
    where: {
      id: decisionId,
      paymentTransaction: {
        organization: {
          status: "ACTIVE",
          deletedAt: null,
          administrators: { some: { administratorId: requestingAdministratorId, administrator: { deletedAt: null } } },
        },
      },
    },
    select: {
      id: true, decision: true, paymentTransactionId: true, unitId: true, decidedBy: true, createdAt: true,
      paymentTransaction: { select: { organizationId: true } },
      unit: { select: { id: true, organizationId: true, deletedAt: true } },
    },
  });
  const organizationId = decision?.paymentTransaction.organizationId;
  if (!decision || !organizationId || !decision.unitId || !decision.unit || decision.unit.organizationId !== organizationId || decision.unit.deletedAt) {
    return empty("SKIPPED_BY_POLICY");
  }

  const correlations = await prisma.paymentEvidenceCorrelation.findMany({
    where: {
      organizationId,
      paymentTransactionId: decision.paymentTransactionId,
      status: "CONFIRMED",
      paymentNotice: { organizationId, linkedPaymentTransactionId: decision.paymentTransactionId },
    },
    select: { paymentNotice: { select: { phone: true } } },
  });
  const fingerprints = identityFingerprintsForNoticePhones(correlations.map((item) => item.paymentNotice.phone));
  if (fingerprints.length === 0) return empty("NO_SIGNAL");

  const signals = await prisma.payerIdentitySignal.findMany({
    where: { organizationId, type: { in: ["PHONE", "WHATSAPP"] }, normalizedFingerprint: { in: fingerprints } },
    select: { id: true, organizationId: true, payerId: true, payer: { select: { id: true, organizationId: true, status: true } } },
    take: 2,
  });
  if (signals.length === 0) return empty("NO_SIGNAL");
  if (signals.length !== 1) return empty("AMBIGUOUS_SIGNAL");
  const signal = signals[0];

  const associations = await prisma.payerUnitAssociation.findMany({
    where: {
      organizationId,
      unitId: decision.unitId,
      OR: [{ signalId: signal.id }, ...(signal.payerId ? [{ payerId: signal.payerId }] : [])],
    },
    select: { organizationId: true, unitId: true, signalId: true, payerId: true, status: true },
  });
  const plan = planLearningFromHumanConfirmation({
    organizationId,
    decision: {
      id: decision.id,
      decision: decision.decision === "APPROVED" ? "APPROVED" : "REJECTED",
      organizationId,
      paymentTransactionId: decision.paymentTransactionId,
      unitId: decision.unitId,
      decidedBy: decision.decidedBy,
      createdAt: decision.createdAt,
    },
    signal: { id: signal.id, organizationId: signal.organizationId, payerId: signal.payerId },
    payer: signal.payer ? { id: signal.payer.id, organizationId: signal.payer.organizationId, status: signal.payer.status } : null,
    unit: { id: decision.unit.id, organizationId: decision.unit.organizationId, active: !decision.unit.deletedAt },
    existingAssociations: associations,
  });
  if (!plan.learned) return empty("SKIPPED_BY_POLICY");

  const results = await persistHumanConfirmationLearning(plan, {
    record: async (intent) => {
      const result = await recordPayerUnitEvidence({ ...intent, ...intent.subject });
      return { result, idempotent: result.idempotent };
    },
  });
  const alreadyApplied = results.filter((item) => item.idempotent).length;
  const persisted = results.length - alreadyApplied;
  return {
    status: alreadyApplied === results.length ? "ALREADY_APPLIED" : plan.status === "PARTIAL" ? "PARTIAL" : "LEARNED",
    signalEvidence: plan.signalUnitEvidencePlanned,
    payerEvidence: plan.payerUnitEvidencePlanned,
    eventsPersisted: persisted,
    eventsAlreadyApplied: alreadyApplied,
  };
}
