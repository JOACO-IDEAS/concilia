import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { organizationAdministrator: { findMany } } }));

import { loadOrganizationsForAdministrator } from "./current-organizations";

describe("loadOrganizationsForAdministrator", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("solo lee membership real del administrador dado, nunca de un id de cliente", async () => {
    findMany.mockResolvedValue([
      { organization: { id: "org-1", name: "Consorcio A" } },
      { organization: { id: "org-2", name: "Consorcio B" } },
    ]);
    const result = await loadOrganizationsForAdministrator("admin-a");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { administratorId: "admin-a" } }));
    expect(result).toEqual([{ id: "org-1", name: "Consorcio A" }, { id: "org-2", name: "Consorcio B" }]);
  });

  it("retorna vacío para un administrador sin membership, sin fallback engañoso", async () => {
    findMany.mockResolvedValue([]);
    await expect(loadOrganizationsForAdministrator("admin-sin-org")).resolves.toEqual([]);
  });
});
