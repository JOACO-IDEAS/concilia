import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, findFirst } = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { organization: { findMany, findFirst } } }));

const { detectarOrganizacionesEnMora, calcularMoraDeUnaOrganizacion } = await import("./detect-overdue");

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
  findFirst.mockResolvedValue(null);
});

describe("detección de mora — aislamiento tenant", () => {
  it("limita el listado al administrador autenticado", async () => {
    await expect(detectarOrganizacionesEnMora("admin-a")).resolves.toEqual([]);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "ACTIVE",
        deletedAt: null,
        administrators: { some: { administratorId: "admin-a" } },
      }),
    }));
  });

  it("trata una organización ajena como inexistente antes de calcular la mora", async () => {
    await expect(calcularMoraDeUnaOrganizacion("org-b", "admin-a")).resolves.toBeNull();

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "org-b",
        administrators: { some: { administratorId: "admin-a" } },
      }),
    }));
  });
});
