import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentAdministrator: vi.fn(),
  paymentFindFirst: vi.fn(),
  evaluationFindMany: vi.fn(),
  decisionFindMany: vi.fn(),
  unitFindFirst: vi.fn(),
  shadowFindUnique: vi.fn(),
  correlationFindMany: vi.fn(),
  unitFindMany: vi.fn(),
  signalFindMany: vi.fn(),
  associationFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireCurrentAdministrator: mocks.requireCurrentAdministrator }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentTransaction: { findFirst: mocks.paymentFindFirst },
    paymentEvidenceAssessmentLog: { findMany: mocks.evaluationFindMany },
    reconciliationMatch: { findMany: mocks.decisionFindMany },
    unit: { findFirst: mocks.unitFindFirst, findMany: mocks.unitFindMany },
    shadowMatchLog: { findFirst: mocks.shadowFindUnique },
    paymentEvidenceCorrelation: { findMany: mocks.correlationFindMany },
    payerIdentitySignal: { findMany: mocks.signalFindMany },
    payerUnitAssociation: { findMany: mocks.associationFindMany },
  },
}));

import { getResolutionWorkspaceData } from "./resolution-workspace-data";

describe("getResolutionWorkspaceData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentAdministrator.mockResolvedValue({ id: "admin-a" });
    mocks.shadowFindUnique.mockResolvedValue(null);
    mocks.correlationFindMany.mockResolvedValue([]);
  });

  it("no lee propuestas ni historial cuando el pago no pertenece al administrador", async () => {
    mocks.paymentFindFirst.mockResolvedValue(null);

    await expect(getResolutionWorkspaceData("payment-foreign")).resolves.toBeNull();

    expect(mocks.paymentFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "payment-foreign", organization: expect.objectContaining({ status: "ACTIVE", deletedAt: null }) }) }));
    expect(mocks.evaluationFindMany).not.toHaveBeenCalled();
    expect(mocks.decisionFindMany).not.toHaveBeenCalled();
  });

  it("no finge wiring 5.0G: intelligence permanece null hasta tener persistencia real", async () => {
    mocks.paymentFindFirst.mockResolvedValue({
      id: "payment-1", organizationId: "org-1", amount: { toNumber: () => 193840 }, currency: "ARS", provider: "BANK",
      concept: null, payerIdentifier: null, referenceNumber: null, transactionDate: null,
      createdAt: new Date("2026-08-21T12:00:00Z"), status: "PENDING", organization: { name: "Consorcio QA" },
    });
    mocks.evaluationFindMany.mockResolvedValue([]);
    mocks.decisionFindMany.mockResolvedValue([]);

    await expect(getResolutionWorkspaceData("payment-1")).resolves.toMatchObject({ intelligence: null, proposal: null });
  });

  it("entrega intelligence real desde evaluación y correlación persistidas sin N+1", async () => {
    mocks.paymentFindFirst.mockResolvedValue({
      id: "payment-1", organizationId: "org-1", amount: { toNumber: () => 100 }, currency: "ARS", provider: "BANK",
      concept: null, payerIdentifier: null, referenceNumber: null, transactionDate: null,
      createdAt: new Date("2026-08-21T12:00:00Z"), status: "PENDING", organization: { name: "Consorcio QA" },
    });
    mocks.evaluationFindMany.mockResolvedValue([]);
    mocks.decisionFindMany.mockResolvedValue([]);
    mocks.shadowFindUnique.mockResolvedValue({
      candidateUnitId: "unit-a", candidateUnitOwnerId: null, candidateObligationId: "obl-a", score: 80, tier: 2,
      topCandidates: [{ unitCode: "A", score: 80, tier: 2, matchedSignals: ["AMOUNT_MATCH"] }],
      signals: [{ signal: "AMOUNT_MATCH", tier: 2, matched: true, strength: "STRONG", evidence: "Importe compatible." }], blockers: [],
    });
    mocks.correlationFindMany.mockResolvedValue([{ paymentNotice: { phone: "+54 11 5555 1234" } }]);
    mocks.unitFindMany.mockResolvedValue([{ id: "unit-a", code: "A", organizationId: "org-1", obligations: [{ id: "obl-a" }] }]);
    mocks.signalFindMany.mockResolvedValue([]);

    await expect(getResolutionWorkspaceData("payment-1")).resolves.toMatchObject({ intelligence: { status: "RESOLVED_CANDIDATE", candidates: [{ unitCode: "A", financialScore: 80 }] } });
    expect(mocks.unitFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.signalFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.associationFindMany).not.toHaveBeenCalled();
  });
});
