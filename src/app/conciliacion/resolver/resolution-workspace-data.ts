"use server";

import { prisma } from "@/lib/prisma";
import { requireCurrentAdministrator } from "@/lib/auth/session";
import type { ReconciliationIntelligenceViewModel } from "@/lib/payer-identity/reconciliation-intelligence-view-model";
import { loadRuntimeFinancialIntelligence } from "@/lib/payer-identity/runtime-financial-intelligence";
import { MATCH_ENGINE_VERSION } from "@/lib/reconciliation/version";

type Candidate = { unitCode: string; matchedSignals: string[] };

export type ResolutionWorkspaceData = {
  payment: {
    id: string;
    amount: number;
    currency: string;
    provider: string;
    concept: string | null;
    payerIdentifier: string | null;
    referenceNumber: string | null;
    transactionDate: string | null;
    createdAt: string;
    status: "PENDING" | "MATCHED" | "UNMATCHED";
    organizationName: string;
  };
  proposal: null | { kind: "SINGLE" | "AMBIGUOUS"; unitId: string | null; unitCode: string | null; explanation: string; evidence: string[]; candidates: Candidate[] };
  /** Real, read-only 5.0G presentation result; null when no current persisted financial evaluation exists. */
  intelligence: ReconciliationIntelligenceViewModel | null;
  resolved: boolean;
  history: { id: string; kind: "RECEIVED" | "PROPOSED" | "APPROVED" | "REJECTED"; title: string; detail: string; createdAt: string }[];
};

function readEvidence(value: unknown): { evidence: string[]; candidates: Candidate[] } {
  if (!value || typeof value !== "object") return { evidence: [], candidates: [] };
  const bank = (value as { bank?: unknown }).bank;
  if (!bank || typeof bank !== "object") return { evidence: [], candidates: [] };
  const rawSignals = (bank as { signals?: unknown }).signals;
  const evidence = Array.isArray(rawSignals)
    ? rawSignals.flatMap((signal) => signal && typeof signal === "object" && (signal as { matched?: unknown }).matched && typeof (signal as { evidence?: unknown }).evidence === "string" ? [(signal as { evidence: string }).evidence] : [])
    : [];
  const rawCandidates = (bank as { topCandidates?: unknown }).topCandidates;
  const candidates = Array.isArray(rawCandidates)
    ? rawCandidates.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const item = candidate as { unitCode?: unknown; matchedSignals?: unknown };
        if (typeof item.unitCode !== "string") return [];
        return [{ unitCode: item.unitCode, matchedSignals: Array.isArray(item.matchedSignals) ? item.matchedSignals.filter((signal): signal is string => typeof signal === "string") : [] }];
      })
    : [];
  return { evidence, candidates };
}

/** Carga el caso tras verificar la propiedad del pago antes de leer sus eventos. */
export async function getResolutionWorkspaceData(paymentTransactionId: string): Promise<ResolutionWorkspaceData | null> {
  const administrator = await requireCurrentAdministrator();
  const payment = await prisma.paymentTransaction.findFirst({
    where: { id: paymentTransactionId, organization: { status: "ACTIVE", deletedAt: null, administrators: { some: { administratorId: administrator.id, administrator: { deletedAt: null } } } } },
    select: { id: true, organizationId: true, amount: true, currency: true, provider: true, concept: true, payerIdentifier: true, referenceNumber: true, transactionDate: true, createdAt: true, status: true, organization: { select: { name: true } } },
  });
  if (!payment?.organization || !payment.organizationId) return null;
  const organizationId = payment.organizationId;

  const [evaluations, decisions, shadow, confirmedCorrelations] = await Promise.all([
    prisma.paymentEvidenceAssessmentLog.findMany({
      where: { paymentTransactionId, paymentTransaction: { organizationId } },
      select: { id: true, candidateUnitId: true, explanation: true, structuredEvidence: true, evaluatedAt: true },
      orderBy: { evaluatedAt: "desc" },
      take: 8,
    }),
    prisma.reconciliationMatch.findMany({
      where: { paymentTransactionId, paymentTransaction: { organizationId } },
      select: { id: true, decision: true, reason: true, rejectionReason: true, decidedBy: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.shadowMatchLog.findFirst({
      where: { paymentTransactionId, engineVersion: MATCH_ENGINE_VERSION, paymentTransaction: { organizationId } },
      select: { candidateUnitId: true, candidateUnitOwnerId: true, candidateObligationId: true, score: true, tier: true, topCandidates: true, signals: true, blockers: true },
    }),
    prisma.paymentEvidenceCorrelation.findMany({
      where: { organizationId, paymentTransactionId, paymentTransaction: { organizationId }, status: "CONFIRMED", paymentNotice: { organizationId, linkedPaymentTransactionId: paymentTransactionId } },
      select: { paymentNotice: { select: { phone: true } } },
    }),
  ]);
  const latest = evaluations[0];
  const candidateUnit = latest?.candidateUnitId
    ? await prisma.unit.findFirst({ where: { id: latest.candidateUnitId, organization: { administrators: { some: { administratorId: administrator.id } } } }, select: { code: true } })
    : null;
  const parsed = latest ? readEvidence(latest.structuredEvidence) : { evidence: [], candidates: [] };
  const proposal = latest
    ? { kind: latest.candidateUnitId ? "SINGLE" as const : "AMBIGUOUS" as const, unitId: candidateUnit ? latest.candidateUnitId : null, unitCode: candidateUnit?.code ?? null, explanation: latest.explanation, evidence: parsed.evidence, candidates: parsed.candidates }
    : null;
  const history = [
    { id: "received", kind: "RECEIVED" as const, title: "Movimiento recibido", detail: "El movimiento quedó registrado en ConcilIA.", createdAt: payment.createdAt.toISOString() },
    ...evaluations.map((evaluation) => ({ id: `proposal:${evaluation.id}`, kind: "PROPOSED" as const, title: "ConcilIA analizó el movimiento", detail: evaluation.explanation, createdAt: evaluation.evaluatedAt.toISOString() })),
    ...decisions.map((decision) => ({ id: `decision:${decision.id}`, kind: decision.decision === "APPROVED" ? "APPROVED" as const : "REJECTED" as const, title: decision.decision === "APPROVED" ? "Un administrador aprobó una conciliación" : "Un administrador rechazó una propuesta", detail: decision.rejectionReason ?? decision.reason, createdAt: decision.createdAt.toISOString() })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const intelligence = await loadRuntimeFinancialIntelligence({
    organizationId,
    paymentTransactionId,
    shadow,
    confirmedNoticePhones: confirmedCorrelations.flatMap((item) => item.paymentNotice ? [item.paymentNotice.phone] : []),
  });

  return {
    payment: { ...payment, amount: payment.amount.toNumber(), transactionDate: payment.transactionDate?.toISOString() ?? null, createdAt: payment.createdAt.toISOString(), organizationName: payment.organization.name },
    proposal,
    intelligence,
    resolved: decisions.some((decision) => decision.decision === "APPROVED"),
    history,
  };
}
