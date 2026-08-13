"use server";

import { prisma } from "@/lib/prisma";
import { requireCurrentAdministrator } from "@/lib/auth/session";
import { filtrarCasosAmbiguos, filtrarCasosRevisables, type DecisionCruda, type EvaluacionCruda } from "@/lib/reconciliation/review-queue";
import type { PaymentEvidenceState } from "@/lib/payment-evidence/evidence-score";
import type { StructuredEvidenceSnapshot } from "@/lib/payment-evidence/evidence-score-store";

export type InboxPayment = {
  id: string;
  amount: number;
  currency: string;
  concept: string | null;
  createdAt: string;
  organizationName: string;
};

export type RecentActivity = {
  id: string;
  kind: "PAYMENT_RECEIVED" | "HUMAN_DECISION";
  title: string;
  detail: string;
  organizationName: string;
  createdAt: string;
};

export type OperationalInboxData = {
  organizationCount: number;
  onboarding: {
    unitCount: number;
    obligationCount: number;
    paymentCount: number;
    reviewCount: number;
    firstDecisionCount: number;
  };
  needsInformation: InboxPayment[];
  recentActivity: RecentActivity[];
  resolvedToday: number;
};

export type OperationalReviewItem = {
  id: string;
  paymentTransactionId: string;
  kind: "SINGLE" | "AMBIGUOUS";
  organizationName: string;
  amount: number;
  currency: string;
  createdAt: string;
  detail: string;
};

export type FirstReviewableCaseStatus =
  | { kind: "REVIEWABLE"; reviewableCount: number; message: string }
  | { kind: "NO_MOVEMENTS"; reviewableCount: 0; message: string }
  | { kind: "WAITING_PROCESSING"; reviewableCount: 0; message: string }
  | { kind: "WAITING_EVIDENCE"; reviewableCount: 0; message: string }
  | { kind: "ASSESSMENT_UNAVAILABLE"; reviewableCount: 0; message: string };

const organizationScope = (administratorId: string) => ({
  administrators: { some: { administratorId } },
});

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Única traducción de persistencia a trabajo revisable. Reutiliza el filtro
 * puro de la cola de revisión: Codex no recalcula evidence ni matching.
 */
async function loadReviewableItems(administratorId: string): Promise<OperationalReviewItem[]> {
  const scope = organizationScope(administratorId);
  const [evaluations, decisions] = await Promise.all([
    prisma.paymentEvidenceAssessmentLog.findMany({
      where: { paymentTransaction: { organization: scope } },
      select: {
        id: true,
        paymentTransactionId: true,
        state: true,
        candidateUnitId: true,
        families: true,
        hasContradiction: true,
        contradictionDetail: true,
        explanation: true,
        structuredEvidence: true,
        evaluatedAt: true,
        paymentTransaction: { select: { id: true, amount: true, currency: true, organization: { select: { name: true } } } },
      },
      orderBy: { evaluatedAt: "desc" },
      take: 500,
    }),
    prisma.reconciliationMatch.findMany({
      where: { paymentTransaction: { organization: scope } },
      select: { paymentTransactionId: true, unitId: true, decision: true },
    }),
  ]);
  const rawEvaluations: EvaluacionCruda[] = evaluations.map((evaluation) => ({
    id: evaluation.id,
    paymentTransactionId: evaluation.paymentTransactionId,
    state: evaluation.state as PaymentEvidenceState,
    candidateUnitId: evaluation.candidateUnitId,
    families: evaluation.families as unknown as EvaluacionCruda["families"],
    hasContradiction: evaluation.hasContradiction,
    contradictionDetail: evaluation.contradictionDetail,
    explanation: evaluation.explanation,
    structuredEvidence: evaluation.structuredEvidence as StructuredEvidenceSnapshot | null,
    evaluatedAt: evaluation.evaluatedAt.toISOString(),
  }));
  const rawDecisions: DecisionCruda[] = decisions.map((decision) => ({
    paymentTransactionId: decision.paymentTransactionId,
    unitId: decision.unitId,
    decision: decision.decision,
  }));
  const paymentById = new Map(evaluations.map((evaluation) => [evaluation.paymentTransactionId, evaluation.paymentTransaction]));
  const singles = filtrarCasosRevisables(rawEvaluations, rawDecisions).map((review) => ({ paymentTransactionId: review.paymentTransactionId, kind: "SINGLE" as const, detail: review.explanation, createdAt: review.evaluatedAt }));
  const ambiguous = filtrarCasosAmbiguos(rawEvaluations, rawDecisions).map((review) => ({ paymentTransactionId: review.paymentTransactionId, kind: "AMBIGUOUS" as const, detail: review.explanation, createdAt: review.evaluatedAt }));

  return [...singles, ...ambiguous]
    .flatMap((review) => {
      const payment = paymentById.get(review.paymentTransactionId);
      if (!payment?.organization) return [];
      return [{
        id: `${review.kind}:${review.paymentTransactionId}`,
        paymentTransactionId: review.paymentTransactionId,
        kind: review.kind,
        organizationName: payment.organization.name,
        amount: payment.amount.toNumber(),
        currency: payment.currency,
        createdAt: review.createdAt,
        detail: review.detail,
      }];
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Estado observable del primer caso: pagos → evaluaciones persistidas → cola revisable existente. */
export async function getFirstReviewableCaseStatus(): Promise<FirstReviewableCaseStatus> {
  const administrator = await requireCurrentAdministrator();
  const scope = organizationScope(administrator.id);
  const paymentCount = await prisma.paymentTransaction.count({ where: { organization: scope } });
  if (paymentCount === 0) return { kind: "NO_MOVEMENTS", reviewableCount: 0, message: "Todavía no hay movimientos importados para analizar." };

  try {
    const assessmentCount = await prisma.paymentEvidenceAssessmentLog.count({ where: { paymentTransaction: { organization: scope } } });
    if (assessmentCount === 0) return { kind: "WAITING_PROCESSING", reviewableCount: 0, message: "Los movimientos ya están registrados. El próximo paso es que ConcilIA persista una evaluación." };
    const reviewable = await loadReviewableItems(administrator.id);
    if (reviewable.length > 0) return { kind: "REVIEWABLE", reviewableCount: reviewable.length, message: "Ya hay una propuesta lista para que tomes una decisión." };
    return { kind: "WAITING_EVIDENCE", reviewableCount: 0, message: "ConcilIA ya evaluó los movimientos, pero todavía no hay evidencia suficiente para pedirte una decisión." };
  } catch {
    return { kind: "ASSESSMENT_UNAVAILABLE", reviewableCount: 0, message: "Las evaluaciones todavía no están disponibles en este entorno." };
  }
}

/**
 * Datos operativos para Inicio. Todas las lecturas pasan por la membresía
 * real del administrador; los pagos sin organización quedan fuera porque no
 * pueden atribuirse con seguridad a un tenant desde esta pantalla.
 */
export async function getOperationalInboxData(): Promise<OperationalInboxData> {
  const administrator = await requireCurrentAdministrator();
  const scope = organizationScope(administrator.id);
  const today = startOfToday();

  const [organizationCount, unitCount, obligationCount, paymentCount, reviewCount, firstDecisionCount, unresolvedPayments, recentPayments, recentDecisions, resolvedToday] = await Promise.all([
    prisma.organization.count({ where: scope }),
    prisma.unit.count({ where: { deletedAt: null, organization: scope } }),
    prisma.obligation.count({ where: { deletedAt: null, unit: { organization: scope } } }),
    prisma.paymentTransaction.count({ where: { organization: scope } }),
    prisma.paymentEvidenceAssessmentLog.count({ where: { state: "NEEDS_DECISION", paymentTransaction: { organization: scope } } }),
    prisma.reconciliationMatch.count({ where: { decision: { in: ["APPROVED", "REJECTED"] }, paymentTransaction: { organization: scope } } }),
    prisma.paymentTransaction.findMany({
      where: { status: "UNMATCHED", organization: scope },
      select: {
        id: true,
        amount: true,
        currency: true,
        concept: true,
        createdAt: true,
        organization: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 8,
    }),
    prisma.paymentTransaction.findMany({
      where: { organization: scope },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        createdAt: true,
        organization: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.reconciliationMatch.findMany({
      where: { paymentTransaction: { organization: scope } },
      select: {
        id: true,
        decision: true,
        createdAt: true,
        paymentTransaction: { select: { organization: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.reconciliationMatch.count({
      where: {
        decision: { in: ["APPROVED", "REJECTED"] },
        createdAt: { gte: today },
        paymentTransaction: { organization: scope },
      },
    }),
  ]);

  const paymentActivity: RecentActivity[] = recentPayments.flatMap((payment) =>
    payment.organization
      ? [{
          id: `payment:${payment.id}`,
          kind: "PAYMENT_RECEIVED" as const,
          title: payment.status === "MATCHED" ? "Pago conciliado" : "Movimiento ingresado",
          detail: `${payment.amount.toNumber().toLocaleString("es-AR", { style: "currency", currency: payment.currency })}`,
          organizationName: payment.organization.name,
          createdAt: payment.createdAt.toISOString(),
        }]
      : []
  );
  const decisionActivity: RecentActivity[] = recentDecisions.flatMap((decision) =>
    decision.paymentTransaction.organization
      ? [{
          id: `decision:${decision.id}`,
          kind: "HUMAN_DECISION" as const,
          title: decision.decision === "APPROVED" ? "Conciliación aprobada" : "Decisión de conciliación registrada",
          detail: "Decisión humana registrada",
          organizationName: decision.paymentTransaction.organization.name,
          createdAt: decision.createdAt.toISOString(),
        }]
      : []
  );

  return {
    organizationCount,
    onboarding: { unitCount, obligationCount, paymentCount, reviewCount, firstDecisionCount },
    needsInformation: unresolvedPayments.flatMap((payment) =>
      payment.organization
        ? [{
            id: payment.id,
            amount: payment.amount.toNumber(),
            currency: payment.currency,
            concept: payment.concept,
            createdAt: payment.createdAt.toISOString(),
            organizationName: payment.organization.name,
          }]
        : []
    ),
    recentActivity: [...paymentActivity, ...decisionActivity]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8),
    resolvedToday,
  };
}

/**
 * La cola depende de evaluaciones que ya produjo el Operational Brain. Codex
 * sólo las presenta y las limita en la consulta por organization membership.
 * Un entorno sin esta tabla no se disfraza de cola vacía.
 */
export async function getOperationalReviewQueue(): Promise<{ available: boolean; items: OperationalReviewItem[] }> {
  try {
    const administrator = await requireCurrentAdministrator();
    return { available: true, items: await loadReviewableItems(administrator.id) };
  } catch {
    return { available: false, items: [] };
  }
}
