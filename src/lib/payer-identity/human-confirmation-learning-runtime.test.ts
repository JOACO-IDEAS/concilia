/* eslint-disable @typescript-eslint/no-explicit-any -- focused Prisma boundary double */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decisionFindFirst: vi.fn(), correlationFindMany: vi.fn(), signalFindMany: vi.fn(), associationFindMany: vi.fn(), record: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {
  reconciliationMatch: { findFirst: mocks.decisionFindFirst },
  paymentEvidenceCorrelation: { findMany: mocks.correlationFindMany },
  payerIdentitySignal: { findMany: mocks.signalFindMany },
  payerUnitAssociation: { findMany: mocks.associationFindMany },
} }));
vi.mock("./unit-memory", () => ({ recordPayerUnitEvidence: mocks.record }));

import { learnFromPersistedHumanConfirmation } from "./human-confirmation-learning-runtime";

const decision = (overrides: Record<string, unknown> = {}) => ({
  id: "decision-1", decision: "APPROVED", paymentTransactionId: "payment-1", unitId: "unit-2a", decidedBy: "admin-author",
  createdAt: new Date("2026-08-21T12:00:00Z"), paymentTransaction: { organizationId: "org-1" },
  unit: { id: "unit-2a", organizationId: "org-1", deletedAt: null }, ...overrides,
});
const signal = (overrides: Record<string, unknown> = {}) => ({ id: "signal-1", organizationId: "org-1", payerId: null, payer: null, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.decisionFindFirst.mockResolvedValue(decision());
  mocks.correlationFindMany.mockResolvedValue([{ paymentNotice: { phone: "+54 11 5555 1234" } }]);
  mocks.signalFindMany.mockResolvedValue([signal()]);
  mocks.associationFindMany.mockResolvedValue([]);
  mocks.record.mockImplementation(async (input: any) => ({ association: { id: `association-${input.signalId ?? input.payerId}` }, event: { id: `event-${input.signalId ?? input.payerId}`, reconciliationMatchId: input.reconciliationMatchId }, idempotent: false }));
});

describe("runtime human confirmation learning", () => {
  it("unknown payer persists signal SUPPORT for the exact confirmed unit", async () => {
    await expect(learnFromPersistedHumanConfirmation("decision-1", "admin-request")).resolves.toMatchObject({ status: "LEARNED", signalEvidence: true, payerEvidence: false });
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ signalId: "signal-1", unitId: "unit-2a", effect: "SUPPORT" }));
  });

  it("known active payer persists two explicit evidence events", async () => {
    mocks.signalFindMany.mockResolvedValue([signal({ payerId: "payer-1", payer: { id: "payer-1", organizationId: "org-1", status: "ACTIVE" } })]);
    const result = await learnFromPersistedHumanConfirmation("decision-1", "admin-request");
    expect(result).toMatchObject({ status: "LEARNED", signalEvidence: true, payerEvidence: true, eventsPersisted: 2 });
    expect(mocks.record.mock.calls.map(([item]) => item.signalId ?? item.payerId)).toEqual(["signal-1", "payer-1"]);
  });

  it("replay reports already applied and does not imply new support", async () => {
    mocks.record.mockResolvedValue({ association: {}, event: {}, idempotent: true });
    await expect(learnFromPersistedHumanConfirmation("decision-1", "admin-request")).resolves.toMatchObject({ status: "ALREADY_APPLIED", eventsPersisted: 0, eventsAlreadyApplied: 1 });
  });

  it("without a correlated signal is an explicit no-op", async () => {
    mocks.correlationFindMany.mockResolvedValue([]);
    await expect(learnFromPersistedHumanConfirmation("decision-1", "admin-request")).resolves.toMatchObject({ status: "NO_SIGNAL" });
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("ambiguous signals are never chosen", async () => {
    mocks.signalFindMany.mockResolvedValue([signal(), signal({ id: "signal-2" })]);
    await expect(learnFromPersistedHumanConfirmation("decision-1", "admin-request")).resolves.toMatchObject({ status: "AMBIGUOUS_SIGNAL" });
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("inactive payer learns only the signal", async () => {
    mocks.signalFindMany.mockResolvedValue([signal({ payerId: "payer-1", payer: { id: "payer-1", organizationId: "org-1", status: "REVOKED" } })]);
    await expect(learnFromPersistedHumanConfirmation("decision-1", "admin-request")).resolves.toMatchObject({ status: "PARTIAL", signalEvidence: true, payerEvidence: false });
  });

  it("cross-tenant payer fails closed without persistence", async () => {
    mocks.signalFindMany.mockResolvedValue([signal({ payerId: "payer-1", payer: { id: "payer-1", organizationId: "org-2", status: "ACTIVE" } })]);
    await expect(learnFromPersistedHumanConfirmation("decision-1", "admin-request")).resolves.toMatchObject({ status: "SKIPPED_BY_POLICY" });
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("cross-tenant unit fails closed before identity lookup", async () => {
    mocks.decisionFindFirst.mockResolvedValue(decision({ unit: { id: "unit-2a", organizationId: "org-2", deletedAt: null } }));
    await expect(learnFromPersistedHumanConfirmation("decision-1", "admin-request")).resolves.toMatchObject({ status: "SKIPPED_BY_POLICY" });
    expect(mocks.correlationFindMany).not.toHaveBeenCalled();
  });

  it("REJECTED never learns", async () => {
    mocks.decisionFindFirst.mockResolvedValue(decision({ decision: "REJECTED" }));
    await expect(learnFromPersistedHumanConfirmation("decision-1", "admin-request")).resolves.toMatchObject({ status: "SKIPPED_BY_POLICY" });
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("decision without an available unit never learns", async () => {
    mocks.decisionFindFirst.mockResolvedValue(decision({ unit: null }));
    await expect(learnFromPersistedHumanConfirmation("decision-1", "admin-request")).resolves.toMatchObject({ status: "SKIPPED_BY_POLICY" });
  });

  it("REVOKED association is not silently reactivated", async () => {
    mocks.associationFindMany.mockResolvedValue([{ organizationId: "org-1", unitId: "unit-2a", signalId: "signal-1", payerId: null, status: "REVOKED" }]);
    await expect(learnFromPersistedHumanConfirmation("decision-1", "admin-request")).resolves.toMatchObject({ status: "SKIPPED_BY_POLICY" });
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("DISPUTED association appends support without deleting history", async () => {
    mocks.associationFindMany.mockResolvedValue([{ organizationId: "org-1", unitId: "unit-2a", signalId: "signal-1", payerId: null, status: "DISPUTED" }]);
    await learnFromPersistedHumanConfirmation("decision-1", "admin-request");
    expect(mocks.record).toHaveBeenCalledTimes(1);
  });

  it("infrastructure persistence errors remain errors", async () => {
    mocks.record.mockRejectedValue(new Error("storage unavailable"));
    await expect(learnFromPersistedHumanConfirmation("decision-1", "admin-request")).rejects.toThrow("storage unavailable");
  });

  it("provenance references exactly the persisted human decision", async () => {
    await learnFromPersistedHumanConfirmation("decision-1", "admin-request");
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ source: "HUMAN_CONFIRMATION", reconciliationMatchId: "decision-1", administratorId: "admin-author" }));
  });

  it("persistence payload contains IDs/provenance and no copied PII", async () => {
    await learnFromPersistedHumanConfirmation("decision-1", "admin-request");
    const payload = JSON.stringify(mocks.record.mock.calls);
    expect(payload).not.toMatch(/phone|whatsapp|email|bank|fingerprint|masked/i);
  });

  it("authorization is enforced in the authoritative decision query", async () => {
    await learnFromPersistedHumanConfirmation("decision-1", "admin-request");
    expect(mocks.decisionFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "decision-1", paymentTransaction: { organization: expect.objectContaining({ status: "ACTIVE", deletedAt: null }) } }) }));
  });
});
