import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  paymentCount: vi.fn(),
  assessmentCount: vi.fn(),
  assessmentFindMany: vi.fn(),
  decisionFindMany: vi.fn(),
  requireCurrentAdministrator: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentTransaction: { count: mocks.paymentCount },
    paymentEvidenceAssessmentLog: { count: mocks.assessmentCount, findMany: mocks.assessmentFindMany },
    reconciliationMatch: { findMany: mocks.decisionFindMany },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireCurrentAdministrator: mocks.requireCurrentAdministrator }));

import { getFirstReviewableCaseStatus } from "./operational-inbox-data";

const scope = { administrators: { some: { administratorId: "admin-a" } } };
const evaluation = (overrides: Record<string, unknown> = {}) => ({
  id: "assessment-a",
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
  ...overrides,
});

describe("getFirstReviewableCaseStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentAdministrator.mockResolvedValue({ id: "admin-a" });
    mocks.paymentCount.mockResolvedValue(1);
    mocks.assessmentCount.mockResolvedValue(1);
    mocks.assessmentFindMany.mockResolvedValue([evaluation()]);
    mocks.decisionFindMany.mockResolvedValue([]);
  });

  it("informa una propuesta existente cuando una evaluación persistida es revisable", async () => {
    await expect(getFirstReviewableCaseStatus()).resolves.toMatchObject({ kind: "REVIEWABLE", reviewableCount: 1 });
  });

  it("informa honestamente que todavía no existe un caso revisable", async () => {
    mocks.assessmentFindMany.mockResolvedValue([evaluation({ state: "INFORMATIONAL", candidateUnitId: null })]);

    await expect(getFirstReviewableCaseStatus()).resolves.toMatchObject({ kind: "WAITING_EVIDENCE", reviewableCount: 0 });
  });

  it("informa espera de evidencia cuando la evaluación persistida todavía necesita datos", async () => {
    mocks.assessmentFindMany.mockResolvedValue([evaluation({ state: "NEEDS_DATA", candidateUnitId: null })]);

    await expect(getFirstReviewableCaseStatus()).resolves.toMatchObject({ kind: "WAITING_EVIDENCE", reviewableCount: 0 });
  });

  it("informa espera de procesamiento cuando hay movimientos sin evaluaciones persistidas", async () => {
    mocks.assessmentCount.mockResolvedValue(0);

    await expect(getFirstReviewableCaseStatus()).resolves.toMatchObject({ kind: "WAITING_PROCESSING", reviewableCount: 0 });
    expect(mocks.assessmentFindMany).not.toHaveBeenCalled();
  });

  it("informa la ausencia de movimientos sin simular un caso", async () => {
    mocks.paymentCount.mockResolvedValue(0);

    await expect(getFirstReviewableCaseStatus()).resolves.toMatchObject({ kind: "NO_MOVEMENTS", reviewableCount: 0 });
    expect(mocks.assessmentCount).not.toHaveBeenCalled();
  });

  it("limita pagos, evaluaciones y decisiones a las organizaciones del administrador", async () => {
    await getFirstReviewableCaseStatus();

    expect(mocks.paymentCount).toHaveBeenCalledWith({ where: { organization: scope } });
    expect(mocks.assessmentCount).toHaveBeenCalledWith({ where: { paymentTransaction: { organization: scope } } });
    expect(mocks.assessmentFindMany.mock.calls[0][0].where.paymentTransaction.organization).toEqual(scope);
    expect(mocks.decisionFindMany.mock.calls[0][0].where.paymentTransaction.organization).toEqual(scope);
  });
});
