import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), administrator: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { organization: { findMany: mocks.findMany } } }));
vi.mock("@/lib/auth/session", () => ({ requireCurrentAdministrator: mocks.administrator }));

import { buscarOrganizaciones } from "./search-actions";

describe("buscarOrganizaciones", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.administrator.mockResolvedValue({ id: "admin-a" }); });

  it("busca únicamente organizaciones del administrador autenticado", async () => {
    mocks.findMany.mockResolvedValue([]);

    await buscarOrganizaciones("Córdoba");

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ administrators: { some: { administratorId: "admin-a" } } }),
    }));
  });
});
