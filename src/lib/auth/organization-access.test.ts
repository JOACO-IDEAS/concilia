import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, requireCurrentAdministrator } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  requireCurrentAdministrator: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { organizationAdministrator: { findUnique } } }));
vi.mock("./session", () => ({ requireCurrentAdministrator }));

const { OrganizationAccessDeniedError, requireOrganizationAccess } = await import("./organization-access");

beforeEach(() => {
  vi.clearAllMocks();
  requireCurrentAdministrator.mockResolvedValue({ id: "admin-a", email: "a@example.com", name: "A" });
});

describe("requireOrganizationAccess", () => {
  it("permite la organización vinculada al administrador autenticado", async () => {
    findUnique.mockResolvedValue({ organizationId: "org-a" });
    await expect(requireOrganizationAccess("org-a")).resolves.toMatchObject({ organizationId: "org-a", administrator: { id: "admin-a" } });
    expect(findUnique).toHaveBeenCalledWith({ where: { administratorId_organizationId: { administratorId: "admin-a", organizationId: "org-a" } }, select: { organizationId: true } });
  });

  it("deniega explícitamente una organización ajena", async () => {
    findUnique.mockResolvedValue(null);
    await expect(requireOrganizationAccess("org-b")).rejects.toBeInstanceOf(OrganizationAccessDeniedError);
  });

  it("propaga el rechazo de una request sin sesión", async () => {
    requireCurrentAdministrator.mockRejectedValue(new Error("Autenticación requerida."));
    await expect(requireOrganizationAccess("org-a")).rejects.toThrow("Autenticación requerida.");
    expect(findUnique).not.toHaveBeenCalled();
  });
});
