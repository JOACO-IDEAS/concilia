import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { PaymentEvidenceCorrelationSource, PaymentEvidenceCorrelationStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

const SAFE_DENIAL_MESSAGE = "Recurso no disponible.";

export class PaymentEvidenceCorrelationAccessError extends Error {
  constructor() {
    super(SAFE_DENIAL_MESSAGE);
    this.name = "PaymentEvidenceCorrelationAccessError";
  }
}

export class PaymentEvidenceCorrelationConflictError extends Error {
  constructor(message = "El aviso ya tiene una correlación confirmada diferente.") {
    super(message);
    this.name = "PaymentEvidenceCorrelationConflictError";
  }
}

export type CorrelationDecisionInput = {
  administratorId: string;
  paymentNoticeId: string;
  paymentTransactionId: string;
  reason: string;
  source: PaymentEvidenceCorrelationSource;
  confidence?: number | null;
  evidenceAssessmentLogId?: string | null;
};

type TransactionClient = Prisma.TransactionClient;

function validateInput(input: CorrelationDecisionInput) {
  if (!input.reason.trim()) throw new Error("La razón de la correlación es obligatoria.");
  if (input.confidence != null && (!Number.isInteger(input.confidence) || input.confidence < 0 || input.confidence > 99)) {
    throw new Error("La confianza debe ser un entero entre 0 y 99.");
  }
}

async function requireActiveMembership(tx: TransactionClient, administratorId: string, organizationId: string) {
  const membership = await tx.organizationAdministrator.findUnique({
    where: { administratorId_organizationId: { administratorId, organizationId } },
    select: {
      id: true,
      administrator: { select: { deletedAt: true } },
      organization: { select: { deletedAt: true, status: true } },
    },
  });
  if (!membership || membership.administrator.deletedAt || membership.organization.deletedAt || membership.organization.status !== "ACTIVE") {
    throw new PaymentEvidenceCorrelationAccessError();
  }
}

async function requireScopedResources(tx: TransactionClient, input: CorrelationDecisionInput) {
  const [notice, transaction] = await Promise.all([
    tx.paymentNotice.findUnique({
      where: { id: input.paymentNoticeId },
      select: { id: true, organizationId: true, linkedPaymentTransactionId: true },
    }),
    tx.paymentTransaction.findUnique({
      where: { id: input.paymentTransactionId },
      select: { id: true, organizationId: true },
    }),
  ]);

  if (!notice?.organizationId || !transaction?.organizationId || notice.organizationId !== transaction.organizationId) {
    throw new PaymentEvidenceCorrelationAccessError();
  }

  await requireActiveMembership(tx, input.administratorId, notice.organizationId);

  if (input.evidenceAssessmentLogId) {
    const assessment = await tx.paymentEvidenceAssessmentLog.findUnique({
      where: { id: input.evidenceAssessmentLogId },
      select: { paymentTransactionId: true },
    });
    if (!assessment || assessment.paymentTransactionId !== transaction.id) {
      throw new PaymentEvidenceCorrelationAccessError();
    }
  }

  return { notice, transaction, organizationId: notice.organizationId };
}

function createData(
  input: CorrelationDecisionInput,
  organizationId: string,
  status: PaymentEvidenceCorrelationStatus,
) {
  return {
    organizationId,
    paymentNoticeId: input.paymentNoticeId,
    paymentTransactionId: input.paymentTransactionId,
    status,
    source: input.source,
    confidence: input.confidence ?? null,
    evidenceAssessmentLogId: input.evidenceAssessmentLogId ?? null,
    reason: input.reason.trim(),
    decidedBy: input.administratorId,
  };
}

async function recordNonConfirmingDecision(
  input: CorrelationDecisionInput,
  status: typeof PaymentEvidenceCorrelationStatus.PROPOSED | typeof PaymentEvidenceCorrelationStatus.REJECTED,
) {
  validateInput(input);
  return prisma.$transaction(async (tx) => {
    const { notice, organizationId } = await requireScopedResources(tx, input);
    if (notice.linkedPaymentTransactionId) throw new PaymentEvidenceCorrelationConflictError();

    const existing = await tx.paymentEvidenceCorrelation.findUnique({
      where: {
        paymentNoticeId_paymentTransactionId_status: {
          paymentNoticeId: input.paymentNoticeId,
          paymentTransactionId: input.paymentTransactionId,
          status,
        },
      },
    });
    if (existing) return existing;

    return tx.paymentEvidenceCorrelation.create({ data: createData(input, organizationId, status) });
  });
}

export function proposePaymentEvidenceCorrelation(input: CorrelationDecisionInput) {
  return recordNonConfirmingDecision(input, PaymentEvidenceCorrelationStatus.PROPOSED);
}

export function rejectPaymentEvidenceCorrelation(input: CorrelationDecisionInput) {
  return recordNonConfirmingDecision(input, PaymentEvidenceCorrelationStatus.REJECTED);
}

export async function confirmPaymentEvidenceCorrelation(input: CorrelationDecisionInput) {
  validateInput(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const { notice, organizationId } = await requireScopedResources(tx, input);
      const existing = await tx.paymentEvidenceCorrelation.findFirst({
        where: { paymentNoticeId: input.paymentNoticeId, status: PaymentEvidenceCorrelationStatus.CONFIRMED },
      });

      if (existing) {
        if (existing.paymentTransactionId !== input.paymentTransactionId) throw new PaymentEvidenceCorrelationConflictError();
        if (notice.linkedPaymentTransactionId !== input.paymentTransactionId) {
          throw new PaymentEvidenceCorrelationConflictError("La proyección del aviso no coincide con su historial confirmado.");
        }
        return existing;
      }
      if (notice.linkedPaymentTransactionId && notice.linkedPaymentTransactionId !== input.paymentTransactionId) {
        throw new PaymentEvidenceCorrelationConflictError();
      }

      const correlation = await tx.paymentEvidenceCorrelation.create({
        data: createData(input, organizationId, PaymentEvidenceCorrelationStatus.CONFIRMED),
      });
      await tx.paymentNotice.update({
        where: { id: input.paymentNoticeId },
        data: { linkedPaymentTransactionId: input.paymentTransactionId, status: "LINKED" },
      });
      return correlation;
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const existing = await getConfirmedPaymentEvidenceCorrelation(input.administratorId, input.paymentNoticeId);
      if (existing?.paymentTransactionId === input.paymentTransactionId) return existing;
      throw new PaymentEvidenceCorrelationConflictError();
    }
    throw error;
  }
}

export async function getConfirmedPaymentEvidenceCorrelation(administratorId: string, paymentNoticeId: string) {
  return prisma.$transaction(async (tx) => {
    const notice = await tx.paymentNotice.findUnique({
      where: { id: paymentNoticeId },
      select: { organizationId: true },
    });
    if (!notice?.organizationId) throw new PaymentEvidenceCorrelationAccessError();
    await requireActiveMembership(tx, administratorId, notice.organizationId);
    return tx.paymentEvidenceCorrelation.findFirst({
      where: {
        paymentNoticeId,
        organizationId: notice.organizationId,
        status: PaymentEvidenceCorrelationStatus.CONFIRMED,
      },
    });
  });
}

export async function getPaymentEvidenceCorrelationHistory(administratorId: string, paymentNoticeId: string) {
  return prisma.$transaction(async (tx) => {
    const notice = await tx.paymentNotice.findUnique({
      where: { id: paymentNoticeId },
      select: { organizationId: true },
    });
    if (!notice?.organizationId) throw new PaymentEvidenceCorrelationAccessError();
    await requireActiveMembership(tx, administratorId, notice.organizationId);
    return tx.paymentEvidenceCorrelation.findMany({
      where: { paymentNoticeId, organizationId: notice.organizationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  });
}
