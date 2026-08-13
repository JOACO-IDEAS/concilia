import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  organizationCount: vi.fn(),
  unitCount: vi.fn(),
  obligationCount: vi.fn(),
  paymentCount: vi.fn(),
  paymentFindMany: vi.fn(),
  decisionFindMany: vi.fn(),
  decisionCount: vi.fn(),
  evidenceFindMany: vi.fn(),
  evidenceCount: vi.fn(),
  requireCurrentAdministrator: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { count: mocks.organizationCount },
    unit: { count: mocks.unitCount },
    obligation: { count: mocks.obligationCount },
    paymentTransaction: { findMany: mocks.paymentFindMany, count: mocks.paymentCount },
    reconciliationMatch: { findMany: mocks.decisionFindMany, count: mocks.decisionCount },
    paymentEvidenceAssessmentLog: { findMany: mocks.evidenceFindMany, count: mocks.evidenceCount },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireCurrentAdministrator: mocks.requireCurrentAdministrator }));

import { getOperationalInboxData, getOperationalReviewQueue } from "./operational-inbox-data";

describe("getOperationalInboxData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentAdministrator.mockResolvedValue({ id: "admin-a" });
    mocks.organizationCount.mockResolvedValue(2);
    mocks.unitCount.mockResolvedValue(4);
    mocks.obligationCount.mockResolvedValue(4);
    mocks.paymentCount.mockResolvedValue(1);
    mocks.paymentFindMany
      .mockResolvedValueOnce([
        { id: "pending-a", amount: { toNumber: () => 1200 }, currency: "ARS", concept: "Expensas", createdAt: new Date("2026-08-12T09:00:00Z"), organization: { name: "Consorcio A" } },
        { id: "foreign-or-unknown", amount: { toNumber: () => 900 }, currency: "ARS", concept: null, createdAt: new Date("2026-08-12T08:00:00Z"), organization: null },
      ])
      .mockResolvedValueOnce([
        { id: "payment-a", amount: { toNumber: () => 1200 }, currency: "ARS", status: "UNMATCHED", createdAt: new Date("2026-08-12T10:00:00Z"), organization: { name: "Consorcio A" } },
      ]);
    mocks.decisionFindMany.mockResolvedValue([
      { id: "decision-a", decision: "APPROVED", createdAt: new Date("2026-08-12T11:00:00Z"), paymentTransaction: { organization: { name: "Consorcio A" } } },
    ]);
    mocks.decisionCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    mocks.evidenceCount.mockResolvedValue(1);
  });

  it("limita todas las consultas tenant-sensitive a las organizaciones autorizadas", async () => {
    const data = await getOperationalInboxData();

    const expectedScope = { administrators: { some: { administratorId: "admin-a" } } };
    expect(mocks.organizationCount).toHaveBeenCalledWith({ where: expectedScope });
    expect(mocks.unitCount).toHaveBeenCalledWith({ where: { deletedAt: null, organization: expectedScope } });
    expect(mocks.obligationCount).toHaveBeenCalledWith({ where: { deletedAt: null, unit: { organization: expectedScope } } });
    expect(mocks.paymentCount).toHaveBeenCalledWith({ where: { organization: expectedScope } });
    expect(mocks.paymentFindMany.mock.calls[0][0].where.organization).toEqual(expectedScope);
    expect(mocks.paymentFindMany.mock.calls[1][0].where.organization).toEqual(expectedScope);
    expect(mocks.decisionFindMany.mock.calls[0][0].where.paymentTransaction.organization).toEqual(expectedScope);
    expect(mocks.decisionCount.mock.calls[0][0].where.paymentTransaction.organization).toEqual(expectedScope);
    expect(data.needsInformation).toEqual([expect.objectContaining({ id: "pending-a", organizationName: "Consorcio A" })]);
    expect(data.recentActivity[0]).toEqual(expect.objectContaining({ kind: "HUMAN_DECISION" }));
    expect(data.resolvedToday).toBe(1);
    expect(data.onboarding).toEqual({ unitCount: 4, obligationCount: 4, paymentCount: 1, reviewCount: 1, firstDecisionCount: 1 });
  });

  it("consulta la cola de decisión sólo dentro de las organizaciones autorizadas", async () => {
    mocks.decisionFindMany.mockResolvedValue([]);
    mocks.evidenceFindMany.mockResolvedValue([
      {
        id: "evaluation-a",
        paymentTransactionId: "payment-a",
        state: "PRE_CONCILIABLE",
        candidateUnitId: "unit-a",
        families: [],
        hasContradiction: false,
        contradictionDetail: null,
        explanation: "Importe y período compatibles.",
        structuredEvidence: null,
        evaluatedAt: new Date("2026-08-12T11:00:00Z"),
        paymentTransaction: { id: "payment-a", amount: { toNumber: () => 1200 }, currency: "ARS", organization: { name: "Consorcio A" } },
      },
    ]);

    const queue = await getOperationalReviewQueue();

    expect(mocks.evidenceFindMany.mock.calls[0][0].where.paymentTransaction.organization).toEqual({ administrators: { some: { administratorId: "admin-a" } } });
    expect(mocks.decisionFindMany.mock.calls[0][0].where.paymentTransaction.organization).toEqual({ administrators: { some: { administratorId: "admin-a" } } });
    expect(queue).toEqual({ available: true, items: [expect.objectContaining({ id: "SINGLE:payment-a", paymentTransactionId: "payment-a", kind: "SINGLE", organizationName: "Consorcio A" })] });
  });
});
