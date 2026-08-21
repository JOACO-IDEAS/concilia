import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { PayerUnitEvidenceEffect, PayerUnitEvidenceSource } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

const SAFE_DENIAL = "Recurso no disponible.";

export class PayerUnitMemoryAccessError extends Error {
  constructor() {
    super(SAFE_DENIAL);
    this.name = "PayerUnitMemoryAccessError";
  }
}

type Tx = Prisma.TransactionClient;
type Subject = { payerId: string; signalId?: never } | { signalId: string; payerId?: never };

export type RecordPayerUnitEvidenceInput = Subject & {
  administratorId: string;
  organizationId: string;
  unitId: string;
  effect: PayerUnitEvidenceEffect;
  source: PayerUnitEvidenceSource;
  reason: string;
  observedAt: Date;
  confidence?: number | null;
  paymentEvidenceCorrelationId?: string | null;
  reconciliationMatchId?: string | null;
  externalEvidenceKey?: string | null;
};

async function requireAccess(tx: Tx, administratorId: string, organizationId: string) {
  const membership = await tx.organizationAdministrator.findUnique({
    where: { administratorId_organizationId: { administratorId, organizationId } },
    select: {
      administrator: { select: { deletedAt: true } },
      organization: { select: { deletedAt: true, status: true } },
    },
  });
  if (!membership || membership.administrator.deletedAt || membership.organization.deletedAt || membership.organization.status !== "ACTIVE") {
    throw new PayerUnitMemoryAccessError();
  }
}

function validateInput(input: RecordPayerUnitEvidenceInput) {
  if (!input.reason.trim()) throw new Error("La razón es obligatoria.");
  if (Number.isNaN(input.observedAt.getTime())) throw new Error("La fecha observada no es válida.");
  if (input.confidence != null && (!Number.isInteger(input.confidence) || input.confidence < 0 || input.confidence > 99)) {
    throw new Error("La confianza debe ser un entero entre 0 y 99.");
  }
}

async function requireContext(tx: Tx, input: RecordPayerUnitEvidenceInput) {
  await requireAccess(tx, input.administratorId, input.organizationId);
  const unit = await tx.unit.findUnique({ where: { id: input.unitId }, select: { organizationId: true, deletedAt: true } });
  if (!unit || unit.organizationId !== input.organizationId || unit.deletedAt) throw new PayerUnitMemoryAccessError();

  if (input.payerId) {
    const payer = await tx.payer.findUnique({ where: { id: input.payerId }, select: { organizationId: true, status: true } });
    if (!payer || payer.organizationId !== input.organizationId || payer.status !== "ACTIVE") throw new PayerUnitMemoryAccessError();
  } else {
    const signal = await tx.payerIdentitySignal.findUnique({ where: { id: input.signalId }, select: { organizationId: true } });
    if (!signal || signal.organizationId !== input.organizationId) throw new PayerUnitMemoryAccessError();
  }

  let correlationTransactionId: string | null = null;
  if (input.paymentEvidenceCorrelationId) {
    const correlation = await tx.paymentEvidenceCorrelation.findUnique({
      where: { id: input.paymentEvidenceCorrelationId },
      select: { organizationId: true, status: true, paymentTransactionId: true, paymentTransaction: { select: { organizationId: true, unitId: true } } },
    });
    if (
      !correlation || correlation.organizationId !== input.organizationId || correlation.status !== "CONFIRMED" ||
      correlation.paymentTransaction.organizationId !== input.organizationId || correlation.paymentTransaction.unitId !== input.unitId
    ) throw new PayerUnitMemoryAccessError();
    correlationTransactionId = correlation.paymentTransactionId;
  }
  if (input.source === PayerUnitEvidenceSource.PAYMENT_CONFIRMED && !input.paymentEvidenceCorrelationId) throw new PayerUnitMemoryAccessError();

  if (input.reconciliationMatchId) {
    const decision = await tx.reconciliationMatch.findUnique({
      where: { id: input.reconciliationMatchId },
      select: { decision: true, unitId: true, paymentTransactionId: true, paymentTransaction: { select: { organizationId: true } } },
    });
    if (
      !decision || decision.decision !== "APPROVED" || decision.unitId !== input.unitId ||
      decision.paymentTransaction.organizationId !== input.organizationId ||
      (correlationTransactionId !== null && decision.paymentTransactionId !== correlationTransactionId)
    ) {
      throw new PayerUnitMemoryAccessError();
    }
  }
  if (input.source === PayerUnitEvidenceSource.HUMAN_CONFIRMATION && !input.reconciliationMatchId) throw new PayerUnitMemoryAccessError();

  if (input.source === PayerUnitEvidenceSource.SYSTEM_OBSERVATION && !input.externalEvidenceKey?.trim()) {
    throw new Error("SYSTEM_OBSERVATION requiere una clave de evidencia estable.");
  }
}

function evidenceKey(input: RecordPayerUnitEvidenceInput) {
  const provenance = input.source === PayerUnitEvidenceSource.PAYMENT_CONFIRMED
    ? input.paymentEvidenceCorrelationId
    : input.source === PayerUnitEvidenceSource.HUMAN_CONFIRMATION
      ? input.reconciliationMatchId
      : input.externalEvidenceKey?.trim();
  const subject = input.payerId ? `payer:${input.payerId}` : `signal:${input.signalId}`;
  return createHash("sha256")
    .update([input.source, provenance, input.effect, subject, input.unitId].join("\0"), "utf8")
    .digest("hex");
}

function associationWhere(input: RecordPayerUnitEvidenceInput) {
  return {
    organizationId: input.organizationId,
    unitId: input.unitId,
    payerId: input.payerId ?? null,
    signalId: input.signalId ?? null,
  };
}

async function recordInTransaction(tx: Tx, input: RecordPayerUnitEvidenceInput) {
  await requireContext(tx, input);
  const key = evidenceKey(input);
  const duplicate = await tx.payerUnitEvidenceEvent.findUnique({
    where: { organizationId_evidenceKey: { organizationId: input.organizationId, evidenceKey: key } },
  });
  if (duplicate) {
    const association = await tx.payerUnitAssociation.findUnique({ where: { id: duplicate.associationId } });
    if (!association) throw new PayerUnitMemoryAccessError();
    return { association, event: duplicate, idempotent: true };
  }

  let association = await tx.payerUnitAssociation.findFirst({ where: associationWhere(input) });
  if (!association) {
    association = await tx.payerUnitAssociation.create({
      data: {
        ...associationWhere(input),
        firstSeenAt: input.observedAt,
        lastSeenAt: input.observedAt,
      },
    });
  }

  const event = await tx.payerUnitEvidenceEvent.create({
    data: {
      organizationId: input.organizationId,
      associationId: association.id,
      effect: input.effect,
      source: input.source,
      evidenceKey: key,
      confidence: input.confidence ?? null,
      paymentEvidenceCorrelationId: input.paymentEvidenceCorrelationId ?? null,
      reconciliationMatchId: input.reconciliationMatchId ?? null,
      reason: input.reason.trim(),
      observedAt: input.observedAt,
      createdBy: input.administratorId,
    },
  });

  const firstSeenAt = input.observedAt < association.firstSeenAt ? input.observedAt : association.firstSeenAt;
  const lastSeenAt = input.observedAt > association.lastSeenAt ? input.observedAt : association.lastSeenAt;
  const isObservation = input.effect !== PayerUnitEvidenceEffect.REVOKE;
  const status = input.effect === PayerUnitEvidenceEffect.REVOKE
    ? "REVOKED"
    : input.effect === PayerUnitEvidenceEffect.CONTRADICT || association.contradictionCount > 0
      ? "DISPUTED"
      : "OBSERVED";
  const updated = await tx.payerUnitAssociation.update({
    where: { id: association.id },
    data: {
      status,
      firstSeenAt,
      lastSeenAt,
      observationCount: isObservation ? { increment: 1 } : undefined,
      supportCount: input.effect === PayerUnitEvidenceEffect.SUPPORT ? { increment: 1 } : undefined,
      contradictionCount: input.effect === PayerUnitEvidenceEffect.CONTRADICT ? { increment: 1 } : undefined,
    },
  });
  return { association: updated, event, idempotent: false };
}

export async function recordPayerUnitEvidence(input: RecordPayerUnitEvidenceInput) {
  validateInput(input);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await prisma.$transaction((tx) => recordInTransaction(tx, input), { isolationLevel: "Serializable" });
    } catch (error) {
      const retryable = typeof error === "object" && error !== null && "code" in error && (error.code === "P2002" || error.code === "P2034");
      if (!retryable || attempt === 1) throw error;
    }
  }
  throw new Error("No se pudo registrar la evidencia.");
}

export async function listUnitsForSignal(administratorId: string, signalId: string) {
  return prisma.$transaction(async (tx) => {
    const signal = await tx.payerIdentitySignal.findUnique({ where: { id: signalId }, select: { organizationId: true } });
    if (!signal) throw new PayerUnitMemoryAccessError();
    await requireAccess(tx, administratorId, signal.organizationId);
    return tx.payerUnitAssociation.findMany({
      where: { organizationId: signal.organizationId, signalId },
      orderBy: [{ lastSeenAt: "desc" }, { id: "asc" }],
    });
  });
}

export async function listPayersForUnit(administratorId: string, unitId: string) {
  return prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUnique({ where: { id: unitId }, select: { organizationId: true, deletedAt: true } });
    if (!unit || unit.deletedAt) throw new PayerUnitMemoryAccessError();
    await requireAccess(tx, administratorId, unit.organizationId);
    return tx.payerUnitAssociation.findMany({
      where: { organizationId: unit.organizationId, unitId, payerId: { not: null } },
      orderBy: [{ lastSeenAt: "desc" }, { id: "asc" }],
    });
  });
}
