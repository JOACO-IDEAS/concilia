import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { requireAccess, created, paymentFindUnique, evidenceFindFirst, unitFindUnique } = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  created: vi.fn(),
  paymentFindUnique: vi.fn(),
  evidenceFindFirst: vi.fn(),
  unitFindUnique: vi.fn(),
}));

const fakePrisma = {
  paymentTransaction: { findUnique: paymentFindUnique, findMany: vi.fn() },
  paymentEvidenceAssessmentLog: { findFirst: evidenceFindFirst, findMany: vi.fn() },
  unit: { findUnique: unitFindUnique, findMany: vi.fn() },
  reconciliationMatch: { create: created, findMany: vi.fn(), count: vi.fn().mockResolvedValue(1) },
  $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(fakePrisma)),
};

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));
vi.mock("@/lib/auth/organization-access", () => ({ requireOrganizationAccess: requireAccess }));
vi.mock("@/lib/auth/session", () => ({ requireCurrentAdministrator: vi.fn(async () => ({ id: "admin-a" })) }));

const {
  aprobarDecisionHumanaAction,
  rechazarDecisionHumanaAction,
  elegirCandidatoAction,
  rechazarTodosLosCandidatosAction,
} = await import("./human-review-actions");

const evaluation = {
  paymentTransactionId: "payment-a",
  candidateUnitId: "unit-a",
  families: [{ unitId: "unit-a", score: 80 }],
  structuredEvidence: { bank: { signals: [] } },
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAccess.mockResolvedValue({ administrator: { id: "admin-a" }, organizationId: "org-a" });
  paymentFindUnique.mockResolvedValue({ organizationId: "org-a" });
  evidenceFindFirst.mockResolvedValue(evaluation);
  unitFindUnique.mockResolvedValue({ organizationId: "org-a", obligations: [] });
  created.mockResolvedValue({ id: "match-1", decision: "APPROVED", createdAt: new Date() });
});

describe("human review — frontera adversarial server-side", () => {
  it("sin sesión/membership autorizada deniega APPROVED, REJECTED, elegir y rechazar-todos antes de crear ReconciliationMatch", async () => {
    requireAccess.mockRejectedValue(new Error("Autenticación requerida."));
    await expect(aprobarDecisionHumanaAction("payment-a", "unit-a")).resolves.toMatchObject({ ok: false });
    await expect(rechazarDecisionHumanaAction("payment-a", "unit-a", "motivo")).resolves.toMatchObject({ ok: false });
    await expect(elegirCandidatoAction("payment-a", "1A")).resolves.toMatchObject({ ok: false });
    await expect(rechazarTodosLosCandidatosAction("payment-a", "motivo")).resolves.toMatchObject({ ok: false });
    expect(created).not.toHaveBeenCalled();
  });

  it("un pago de organización ajena se deniega aunque el atacante conozca su paymentTransactionId", async () => {
    requireAccess.mockRejectedValue(new Error("No tenés acceso a esta organización."));
    await expect(aprobarDecisionHumanaAction("payment-b", "unit-b")).resolves.toMatchObject({ ok: false });
    expect(created).not.toHaveBeenCalled();
  });

  it("deniega una candidate Unit de otra organización aunque el administrador sea válido", async () => {
    unitFindUnique.mockResolvedValue({ organizationId: "org-b", obligations: [] });
    await expect(aprobarDecisionHumanaAction("payment-a", "unit-b")).resolves.toMatchObject({ ok: false });
    expect(created).not.toHaveBeenCalled();
  });

  it("ignora cualquier identidad de cliente: decidedBy viene de requireOrganizationAccess", async () => {
    await aprobarDecisionHumanaAction("payment-a", "unit-a");
    expect(created).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ decidedBy: "admin-a" }) }));
  });

  it("replay de la misma aprobación crea dos eventos append-only: finding, no deduplicación", async () => {
    await aprobarDecisionHumanaAction("payment-a", "unit-a");
    await aprobarDecisionHumanaAction("payment-a", "unit-a");
    expect(created).toHaveBeenCalledTimes(2);
  });
});
