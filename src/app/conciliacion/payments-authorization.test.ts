import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
const { findUnique, update, access } = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { paymentTransaction: { findUnique, update } } }));
vi.mock("@/lib/auth/organization-access", () => ({ requireOrganizationAccess: access }));
vi.mock("@/lib/auth/resource-access", () => ({ requirePaymentAccess: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireCurrentAdministrator: vi.fn() }));
vi.mock("@/lib/payments/smart-match", () => ({ calcularSugerenciasSmartMatch: vi.fn() }));
vi.mock("@/lib/notifications/send-payment-notifications", () => ({ notificarPagoMatched: vi.fn() }));
const { vincularPagoManualmente } = await import("./payments-actions");

beforeEach(() => { vi.clearAllMocks(); findUnique.mockResolvedValue({ organizationId: null }); access.mockResolvedValue({ organizationId: "org-a" }); update.mockResolvedValue({}); });

describe("vincularPagoManualmente — aislamiento tenant", () => {
  it("permite vincular un pago sin owner a una organización autorizada", async () => {
    await expect(vincularPagoManualmente("pay-unmatched", "org-a")).resolves.toMatchObject({ ok: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "pay-unmatched" }, data: expect.objectContaining({ organizationId: "org-a" }) }));
  });
  it("deniega el target Organization ajeno antes de mutar", async () => {
    access.mockRejectedValue(new Error("No tenés acceso a esta organización."));
    await expect(vincularPagoManualmente("pay-unmatched", "org-b")).resolves.toMatchObject({ ok: false });
    expect(update).not.toHaveBeenCalled();
  });
  it("deniega relacionar un pago ya perteneciente a Organization A con Organization B", async () => {
    findUnique.mockResolvedValue({ organizationId: "org-a" }); access.mockResolvedValue({ organizationId: "org-b" });
    await expect(vincularPagoManualmente("pay-a", "org-b")).resolves.toMatchObject({ ok: false });
    expect(update).not.toHaveBeenCalled();
  });
});
