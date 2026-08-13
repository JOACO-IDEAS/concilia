import { beforeEach, describe, expect, it, vi } from "vitest";

const { paymentFindUnique, unitFindUnique, obligationFindUnique, ownerFindUnique, requireOrganizationAccess } = vi.hoisted(() => ({
  paymentFindUnique: vi.fn(), unitFindUnique: vi.fn(), obligationFindUnique: vi.fn(), ownerFindUnique: vi.fn(), requireOrganizationAccess: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {
  paymentTransaction: { findUnique: paymentFindUnique }, unit: { findUnique: unitFindUnique },
  obligation: { findUnique: obligationFindUnique }, unitOwner: { findUnique: ownerFindUnique },
} }));
vi.mock("./organization-access", () => ({ requireOrganizationAccess }));

const { requirePaymentAccess, requireUnitAccess, requireObligationAccess, requireUnitOwnerAccess } = await import("./resource-access");

beforeEach(() => {
  vi.clearAllMocks();
  requireOrganizationAccess.mockImplementation(async (organizationId: string) => {
    if (organizationId !== "org-a") throw new Error("No tenés acceso a esta organización.");
    return { organizationId, administrator: { id: "admin-a" } };
  });
});

describe("resource access — ownership adversarial", () => {
  it("autoriza recursos de Organization A y deniega Payment/Unit/Obligation/Owner de Organization B", async () => {
    paymentFindUnique.mockResolvedValueOnce({ id: "pay-a", organizationId: "org-a" }).mockResolvedValueOnce({ id: "pay-b", organizationId: "org-b" });
    unitFindUnique.mockResolvedValueOnce({ id: "unit-a", organizationId: "org-a" }).mockResolvedValueOnce({ id: "unit-b", organizationId: "org-b" });
    obligationFindUnique.mockResolvedValueOnce({ id: "ob-a", unit: { organizationId: "org-a" } }).mockResolvedValueOnce({ id: "ob-b", unit: { organizationId: "org-b" } });
    ownerFindUnique.mockResolvedValueOnce({ id: "owner-a", unit: { organizationId: "org-a" } }).mockResolvedValueOnce({ id: "owner-b", unit: { organizationId: "org-b" } });
    await expect(requirePaymentAccess("pay-a")).resolves.toMatchObject({ organizationId: "org-a" });
    await expect(requirePaymentAccess("pay-b")).rejects.toThrow(/acceso/);
    await expect(requireUnitAccess("unit-a")).resolves.toMatchObject({ organizationId: "org-a" });
    await expect(requireUnitAccess("unit-b")).rejects.toThrow(/acceso/);
    await expect(requireObligationAccess("ob-a")).resolves.toMatchObject({ organizationId: "org-a" });
    await expect(requireObligationAccess("ob-b")).rejects.toThrow(/acceso/);
    await expect(requireUnitOwnerAccess("owner-a")).resolves.toMatchObject({ organizationId: "org-a" });
    await expect(requireUnitOwnerAccess("owner-b")).rejects.toThrow(/acceso/);
  });

  it("deniega un pago sin organización resuelta", async () => {
    paymentFindUnique.mockResolvedValue({ id: "pay-unmatched", organizationId: null });
    await expect(requirePaymentAccess("pay-unmatched")).rejects.toThrow("Recurso no disponible.");
  });
});
