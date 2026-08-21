import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentAdministrator: vi.fn(),
  paymentFindFirst: vi.fn(),
  evaluationFindMany: vi.fn(),
  decisionFindMany: vi.fn(),
  unitFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireCurrentAdministrator: mocks.requireCurrentAdministrator }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentTransaction: { findFirst: mocks.paymentFindFirst },
    paymentEvidenceAssessmentLog: { findMany: mocks.evaluationFindMany },
    reconciliationMatch: { findMany: mocks.decisionFindMany },
    unit: { findFirst: mocks.unitFindFirst },
  },
}));

import { getResolutionWorkspaceData } from "./resolution-workspace-data";

describe("getResolutionWorkspaceData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentAdministrator.mockResolvedValue({ id: "admin-a" });
  });

  it("no lee propuestas ni historial cuando el pago no pertenece al administrador", async () => {
    mocks.paymentFindFirst.mockResolvedValue(null);

    await expect(getResolutionWorkspaceData("payment-foreign")).resolves.toBeNull();

    expect(mocks.paymentFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "payment-foreign", organization: { administrators: { some: { administratorId: "admin-a" } } } },
    }));
    expect(mocks.evaluationFindMany).not.toHaveBeenCalled();
    expect(mocks.decisionFindMany).not.toHaveBeenCalled();
  });

  it("no finge wiring 5.0G: intelligence permanece null hasta tener persistencia real", async () => {
    mocks.paymentFindFirst.mockResolvedValue({
      id: "payment-1", amount: { toNumber: () => 193840 }, currency: "ARS", provider: "BANK",
      concept: null, payerIdentifier: null, referenceNumber: null, transactionDate: null,
      createdAt: new Date("2026-08-21T12:00:00Z"), status: "PENDING", organization: { name: "Consorcio QA" },
    });
    mocks.evaluationFindMany.mockResolvedValue([]);
    mocks.decisionFindMany.mockResolvedValue([]);

    await expect(getResolutionWorkspaceData("payment-1")).resolves.toMatchObject({ intelligence: null, proposal: null });
  });
});
