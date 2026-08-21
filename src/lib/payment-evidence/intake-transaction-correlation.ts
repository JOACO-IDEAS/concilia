import "server-only";

import { prisma } from "@/lib/prisma";

export const INTAKE_TRANSACTION_POLICY_VERSION = "1";
export const INTAKE_TRANSACTION_DATE_WINDOW_DAYS = 3;
export const INTAKE_TRANSACTION_CANDIDATE_LIMIT = 50;
export const INTAKE_TRANSACTION_PROPOSAL_THRESHOLD = 60;

type SignalType = "AMOUNT_EXACT" | "DATE_EXACT" | "DATE_NEAR" | "OPERATION_REFERENCE_EXACT" | "TRANSFER_REFERENCE_MATCH";
type BlockerType = "AMOUNT_CONFLICT" | "CURRENCY_CONFLICT";

export type TransactionCorrelationCandidate = {
  transactionId: string;
  score: number;
  signals: Array<{ type: SignalType; points: number }>;
  blockers: Array<{ type: BlockerType }>;
};

export type IntakeTransactionCorrelationResult = {
  status: "MATCHED" | "AMBIGUOUS" | "INSUFFICIENT_EVIDENCE" | "NO_CANDIDATES";
  extractionRunId: string;
  candidates: TransactionCorrelationCandidate[];
  proposedTransactionIds: string[];
  limitations: Array<"BANK_NAME_UNAVAILABLE" | "ACCOUNT_FINGERPRINT_UNAVAILABLE" | "PAYER_NAME_NOT_AUTHORITATIVE" | "CANDIDATE_LIMIT_EXCEEDED">;
  policyVersion: string;
};

export class IntakeTransactionCorrelationAccessError extends Error {
  constructor() { super("Recurso no disponible."); this.name = "IntakeTransactionCorrelationAccessError"; }
}

type FactRow = {
  type: string;
  normalizedValue: string | null;
  numericValue: { toNumber(): number } | number | null;
  dateValue: Date | null;
  currency: string | null;
};

type TransactionRow = {
  id: string;
  amount: { toNumber(): number } | number;
  currency: string;
  transactionDate: Date | null;
  referenceNumber: string | null;
  concept: string | null;
};

function numberValue(value: { toNumber(): number } | number | null) {
  if (value == null) return null;
  return typeof value === "number" ? value : value.toNumber();
}

function normalizedReference(value: string | null) {
  return value?.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase() || null;
}

function dayDifference(left: Date, right: Date) {
  return Math.abs(left.getTime() - right.getTime()) / 86_400_000;
}

function selectFact(facts: FactRow[], type: string) { return facts.find((fact) => fact.type === type); }

export function scoreTransactionCandidate(transaction: TransactionRow, facts: FactRow[]): TransactionCorrelationCandidate {
  const amount = selectFact(facts, "AMOUNT");
  const date = selectFact(facts, "DATE");
  const operationReference = selectFact(facts, "OPERATION_REFERENCE");
  const transferReference = selectFact(facts, "TRANSFER_REFERENCE");
  const signals: TransactionCorrelationCandidate["signals"] = [];
  const blockers: TransactionCorrelationCandidate["blockers"] = [];
  const expectedAmount = numberValue(amount?.numericValue ?? null);
  const transactionAmount = numberValue(transaction.amount);

  if (expectedAmount != null) {
    if (amount?.currency && amount.currency !== transaction.currency) blockers.push({ type: "CURRENCY_CONFLICT" });
    else if (transactionAmount === expectedAmount) signals.push({ type: "AMOUNT_EXACT", points: 35 });
    else blockers.push({ type: "AMOUNT_CONFLICT" });
  }
  if (date?.dateValue && transaction.transactionDate) {
    const difference = dayDifference(date.dateValue, transaction.transactionDate);
    if (difference === 0) signals.push({ type: "DATE_EXACT", points: 25 });
    else if (difference <= INTAKE_TRANSACTION_DATE_WINDOW_DAYS) signals.push({ type: "DATE_NEAR", points: 12 });
  }
  const expectedReference = normalizedReference(operationReference?.normalizedValue ?? null);
  if (expectedReference && normalizedReference(transaction.referenceNumber) === expectedReference) signals.push({ type: "OPERATION_REFERENCE_EXACT", points: 60 });
  const expectedDescription = normalizedReference(transferReference?.normalizedValue ?? null);
  const transactionDescription = normalizedReference(transaction.concept);
  if (expectedDescription && transactionDescription?.includes(expectedDescription)) signals.push({ type: "TRANSFER_REFERENCE_MATCH", points: 10 });

  const score = blockers.length ? 0 : Math.min(99, signals.reduce((total, signal) => total + signal.points, 0));
  return { transactionId: transaction.id, score, signals, blockers };
}

function candidateWhere(organizationId: string, facts: FactRow[]) {
  const amount = selectFact(facts, "AMOUNT");
  const date = selectFact(facts, "DATE")?.dateValue;
  const reference = selectFact(facts, "OPERATION_REFERENCE")?.normalizedValue;
  const description = selectFact(facts, "TRANSFER_REFERENCE")?.normalizedValue;
  const or: Array<Record<string, unknown>> = [];
  const amountValue = numberValue(amount?.numericValue ?? null);
  if (amountValue != null) or.push({ amount: amountValue });
  if (date) {
    const window = INTAKE_TRANSACTION_DATE_WINDOW_DAYS * 86_400_000;
    or.push({ transactionDate: { gte: new Date(date.getTime() - window), lte: new Date(date.getTime() + window) } });
  }
  if (reference) or.push({ referenceNumber: { equals: reference, mode: "insensitive" } });
  if (description) or.push({ concept: { contains: description, mode: "insensitive" } });
  return or.length ? { organizationId, OR: or } : null;
}

function limitationsFor(facts: FactRow[]): IntakeTransactionCorrelationResult["limitations"] {
  const limitations: IntakeTransactionCorrelationResult["limitations"] = [];
  if (selectFact(facts, "BANK_NAME")) limitations.push("BANK_NAME_UNAVAILABLE");
  if (selectFact(facts, "ACCOUNT_IDENTIFIER")) limitations.push("ACCOUNT_FINGERPRINT_UNAVAILABLE");
  if (selectFact(facts, "PAYER_DISPLAY_NAME")) limitations.push("PAYER_NAME_NOT_AUTHORITATIVE");
  return limitations;
}

/** Proposes transaction correlations only. It never confirms, reconciles, resolves identity or learns. */
export async function correlateIntakeToTransactions(administratorId: string, organizationId: string, extractionRunId: string): Promise<IntakeTransactionCorrelationResult> {
  return prisma.$transaction(async (tx) => {
    const membership = await tx.organizationAdministrator.findUnique({
      where: { administratorId_organizationId: { administratorId, organizationId } },
      select: { administrator: { select: { deletedAt: true } }, organization: { select: { deletedAt: true, status: true } } },
    });
    if (!membership || membership.administrator.deletedAt || membership.organization.deletedAt || membership.organization.status !== "ACTIVE") throw new IntakeTransactionCorrelationAccessError();
    const run = await tx.paymentEvidenceExtractionRun.findFirst({
      where: { id: extractionRunId, organizationId, status: "SUCCEEDED" },
      select: { id: true, facts: { select: { type: true, normalizedValue: true, numericValue: true, dateValue: true, currency: true } } },
    });
    if (!run) throw new IntakeTransactionCorrelationAccessError();
    const facts = run.facts as FactRow[];
    const limitations = limitationsFor(facts);
    const where = candidateWhere(organizationId, facts);
    if (!where) return { status: "INSUFFICIENT_EVIDENCE", extractionRunId, candidates: [], proposedTransactionIds: [], limitations, policyVersion: INTAKE_TRANSACTION_POLICY_VERSION };

    const transactions = await tx.paymentTransaction.findMany({
      where,
      select: { id: true, amount: true, currency: true, transactionDate: true, referenceNumber: true, concept: true },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { id: "asc" }],
      take: INTAKE_TRANSACTION_CANDIDATE_LIMIT + 1,
    });
    if (transactions.length > INTAKE_TRANSACTION_CANDIDATE_LIMIT) {
      return { status: "INSUFFICIENT_EVIDENCE", extractionRunId, candidates: [], proposedTransactionIds: [], limitations: [...limitations, "CANDIDATE_LIMIT_EXCEEDED"], policyVersion: INTAKE_TRANSACTION_POLICY_VERSION };
    }
    if (transactions.length === 0) return { status: "NO_CANDIDATES", extractionRunId, candidates: [], proposedTransactionIds: [], limitations, policyVersion: INTAKE_TRANSACTION_POLICY_VERSION };

    const candidates = (transactions as TransactionRow[]).map((transaction) => scoreTransactionCandidate(transaction, facts)).sort((a, b) => b.score - a.score || a.transactionId.localeCompare(b.transactionId));
    const topScore = candidates[0]?.score ?? 0;
    if (topScore < INTAKE_TRANSACTION_PROPOSAL_THRESHOLD) {
      return { status: "INSUFFICIENT_EVIDENCE", extractionRunId, candidates, proposedTransactionIds: [], limitations, policyVersion: INTAKE_TRANSACTION_POLICY_VERSION };
    }
    const proposed = candidates.filter((candidate) => candidate.score === topScore && candidate.blockers.length === 0);
    await tx.paymentEvidenceCorrelation.createMany({ data: proposed.map((candidate) => ({
      organizationId,
      extractionRunId,
      paymentNoticeId: null,
      paymentTransactionId: candidate.transactionId,
      status: "PROPOSED" as const,
      source: "SYSTEM_EVIDENCE" as const,
      confidence: candidate.score,
      reason: candidate.signals.map((signal) => signal.type).join(", "),
      decidedBy: null,
    })), skipDuplicates: true });
    return { status: proposed.length === 1 ? "MATCHED" : "AMBIGUOUS", extractionRunId, candidates, proposedTransactionIds: proposed.map((candidate) => candidate.transactionId), limitations, policyVersion: INTAKE_TRANSACTION_POLICY_VERSION };
  });
}
