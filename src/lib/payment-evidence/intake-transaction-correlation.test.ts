import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ membership: vi.fn(), run: vi.fn(), transactions: vi.fn(), createMany: vi.fn(), transaction: vi.fn(), keys: new Set<string>() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import {
  INTAKE_TRANSACTION_CANDIDATE_LIMIT,
  correlateIntakeToTransactions,
  IntakeTransactionCorrelationAccessError,
  scoreTransactionCandidate,
} from "./intake-transaction-correlation";

const date = new Date("2026-08-21T00:00:00Z");
const amountFact = { type: "AMOUNT", normalizedValue: null, numericValue: 210000, dateValue: null, currency: "ARS" };
const dateFact = { type: "DATE", normalizedValue: null, numericValue: null, dateValue: date, currency: null };
const transaction = (id: string, overrides = {}) => ({ id, amount: 210000, currency: "ARS", transactionDate: date, referenceNumber: null, concept: null, ...overrides });

describe("intake-to-transaction correlation", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.keys.clear();
    mocks.membership.mockResolvedValue({ administrator: { deletedAt: null }, organization: { deletedAt: null, status: "ACTIVE" } });
    mocks.run.mockResolvedValue({ id: "run-a", facts: [amountFact, dateFact] });
    mocks.transactions.mockResolvedValue([transaction("tx-a")]);
    mocks.createMany.mockImplementation(async ({ data, skipDuplicates }) => {
      let count = 0;
      for (const row of data) {
        const key = `${row.extractionRunId}:${row.paymentTransactionId}:${row.status}`;
        if (!mocks.keys.has(key)) { mocks.keys.add(key); count += 1; } else if (!skipDuplicates) throw new Error("duplicate");
      }
      return { count };
    });
    mocks.transaction.mockImplementation((callback) => callback({
      organizationAdministrator: { findUnique: mocks.membership },
      paymentEvidenceExtractionRun: { findFirst: mocks.run },
      paymentTransaction: { findMany: mocks.transactions },
      paymentEvidenceCorrelation: { createMany: mocks.createMany },
    }));
  });

  it("proposes one strong amount + exact-date correlation", async () => {
    const result = await correlateIntakeToTransactions("admin-a", "org-a", "run-a");
    expect(result).toMatchObject({ status: "MATCHED", proposedTransactionIds: ["tx-a"], candidates: [{ score: 60 }] });
    expect(mocks.createMany.mock.calls[0][0]).toMatchObject({ skipDuplicates: true, data: [{ extractionRunId: "run-a", paymentNoticeId: null, paymentTransactionId: "tx-a", status: "PROPOSED", source: "SYSTEM_EVIDENCE", confidence: 60 }] });
  });

  it("uses date to disambiguate equal amounts", async () => {
    mocks.transactions.mockResolvedValue([transaction("exact"), transaction("near", { transactionDate: new Date("2026-08-23T00:00:00Z") })]);
    const result = await correlateIntakeToTransactions("admin-a", "org-a", "run-a");
    expect(result.status).toBe("MATCHED"); expect(result.proposedTransactionIds).toEqual(["exact"]);
    expect(result.candidates.map((candidate) => [candidate.transactionId, candidate.score])).toEqual([["exact", 60], ["near", 47]]);
  });

  it("preserves ambiguity for equal amount and date", async () => {
    mocks.transactions.mockResolvedValue([transaction("tx-a"), transaction("tx-b")]);
    const result = await correlateIntakeToTransactions("admin-a", "org-a", "run-a");
    expect(result.status).toBe("AMBIGUOUS"); expect(result.proposedTransactionIds).toEqual(["tx-a", "tx-b"]);
  });

  it("treats exact operation reference as strong, including without amount", async () => {
    mocks.run.mockResolvedValue({ id: "run-a", facts: [{ type: "OPERATION_REFERENCE", normalizedValue: "REF-42", numericValue: null, dateValue: null, currency: null }] });
    mocks.transactions.mockResolvedValue([transaction("wrong", { referenceNumber: "REF-1" }), transaction("right", { referenceNumber: "ref-42" })]);
    const result = await correlateIntakeToTransactions("admin-a", "org-a", "run-a");
    expect(result.status).toBe("MATCHED"); expect(result.proposedTransactionIds).toEqual(["right"]);
  });

  it("makes an amount conflict an explicit blocker", () => {
    const scored = scoreTransactionCandidate(transaction("tx", { amount: 100 }), [amountFact, dateFact]);
    expect(scored).toMatchObject({ score: 0, blockers: [{ type: "AMOUNT_CONFLICT" }] });
  });

  it("returns insufficient evidence when facts are not transaction-correlatable", async () => {
    mocks.run.mockResolvedValue({ id: "run-a", facts: [{ type: "PAYER_DISPLAY_NAME", normalizedValue: "Persona", numericValue: null, dateValue: null, currency: null }] });
    const result = await correlateIntakeToTransactions("admin-a", "org-a", "run-a");
    expect(result).toMatchObject({ status: "INSUFFICIENT_EVIDENCE", candidates: [], limitations: ["PAYER_NAME_NOT_AUTHORITATIVE"] });
    expect(mocks.transactions).not.toHaveBeenCalled(); expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("returns no candidates without persisting", async () => {
    mocks.transactions.mockResolvedValue([]);
    await expect(correlateIntakeToTransactions("admin-a", "org-a", "run-a")).resolves.toMatchObject({ status: "NO_CANDIDATES" });
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("scopes both extraction and candidate queries to the tenant", async () => {
    await correlateIntakeToTransactions("admin-a", "org-a", "run-a");
    expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "run-a", organizationId: "org-a", status: "SUCCEEDED" } }));
    expect(mocks.transactions.mock.calls[0][0].where.organizationId).toBe("org-a");
  });

  it("fails closed for a cross-tenant or inaccessible extraction", async () => {
    mocks.run.mockResolvedValue(null);
    await expect(correlateIntakeToTransactions("admin-a", "org-a", "run-other")).rejects.toBeInstanceOf(IntakeTransactionCorrelationAccessError);
    expect(mocks.transactions).not.toHaveBeenCalled();
  });

  it("replay uses the durable unique key and skipDuplicates", async () => {
    await correlateIntakeToTransactions("admin-a", "org-a", "run-a");
    await correlateIntakeToTransactions("admin-a", "org-a", "run-a");
    expect(mocks.keys.size).toBe(1);
    expect(mocks.createMany.mock.calls.every(([arg]) => arg.skipDuplicates)).toBe(true);
  });

  it("a new extraction run creates separate history", async () => {
    await correlateIntakeToTransactions("admin-a", "org-a", "run-a");
    await correlateIntakeToTransactions("admin-a", "org-a", "run-b");
    expect(mocks.keys).toEqual(new Set(["run-a:tx-a:PROPOSED", "run-b:tx-a:PROPOSED"]));
  });

  it("does not reconstruct raw account identifiers or claim a fingerprint match", async () => {
    mocks.run.mockResolvedValue({ id: "run-a", facts: [{ type: "ACCOUNT_IDENTIFIER", normalizedValue: null, numericValue: null, dateValue: null, currency: null }] });
    const result = await correlateIntakeToTransactions("admin-a", "org-a", "run-a");
    expect(result.limitations).toContain("ACCOUNT_FINGERPRINT_UNAVAILABLE");
    expect(mocks.transactions).not.toHaveBeenCalled();
  });

  it("degrades safely when the candidate cap is exceeded", async () => {
    mocks.transactions.mockResolvedValue(Array.from({ length: INTAKE_TRANSACTION_CANDIDATE_LIMIT + 1 }, (_, index) => transaction(`tx-${index}`)));
    const result = await correlateIntakeToTransactions("admin-a", "org-a", "run-a");
    expect(result).toMatchObject({ status: "INSUFFICIENT_EVIDENCE", candidates: [], proposedTransactionIds: [] });
    expect(result.limitations).toContain("CANDIDATE_LIMIT_EXCEEDED"); expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("touches no unit, payer, learning, reconciliation or AUTO delegates and logs no PII", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await correlateIntakeToTransactions("admin-a", "org-a", "run-a");
    expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    log.mockRestore(); error.mockRestore();
  });
});
