import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockObligation, mockUnit } = vi.hoisted(() => {
  const mockObligation = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  };
  const mockUnit = {
    findMany: vi.fn(),
  };
  return { mockObligation, mockUnit };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { obligation: mockObligation, unit: mockUnit },
}));
vi.mock("@/lib/auth/organization-access", () => ({ requireOrganizationAccess: vi.fn(async () => ({ organizationId: "org1" })) }));
vi.mock("@/lib/auth/resource-access", () => ({
  requireUnitAccess: vi.fn(async () => ({ organizationId: "org1", unit: { id: "u1" } })),
  requireObligationAccess: vi.fn(async () => ({ organizationId: "org1", obligation: { id: "ob-1" } })),
}));

const {
  crearObligacion,
  actualizarObligacion,
  eliminarObligacion,
  listarObligaciones,
  importarObligaciones,
} = await import("./obligaciones-actions");
const { parsearPeriodo } = await import("@/lib/import/period");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parsearPeriodo", () => {
  it("acepta AAAA-MM y normaliza a primer día del mes UTC", () => {
    const d = parsearPeriodo("2026-08");
    expect(d?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("acepta AAAA-MM-DD ignorando el día", () => {
    const d = parsearPeriodo("2026-08-15");
    expect(d?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("acepta MM/AAAA", () => {
    const d = parsearPeriodo("08/2026");
    expect(d?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("rechaza formatos no reconocidos, sin adivinar", () => {
    expect(parsearPeriodo("Agosto 2026")).toBeNull();
    expect(parsearPeriodo("")).toBeNull();
    expect(parsearPeriodo("2026-13")).toBeNull(); // mes inválido
  });
});

describe("crearObligacion — CRUD y validaciones", () => {
  it("crea una obligación con período válido e importe positivo", async () => {
    mockObligation.create.mockResolvedValue({ id: "ob-1" });

    const r = await crearObligacion({ unitId: "u1", period: "2026-08", amount: 145000 });

    expect(r.ok).toBe(true);
    expect(r.obligationId).toBe("ob-1");
    expect(mockObligation.create).toHaveBeenCalledWith({
      data: {
        unitId: "u1",
        period: new Date(Date.UTC(2026, 7, 1)),
        amount: 145000,
        concept: null,
        dueDate: null,
      },
    });
  });

  it("rechaza un período inválido sin llegar a la base", async () => {
    const r = await crearObligacion({ unitId: "u1", period: "no-es-un-periodo", amount: 100 });
    expect(r.ok).toBe(false);
    expect(mockObligation.create).not.toHaveBeenCalled();
  });

  it("rechaza un importe <= 0 sin llegar a la base", async () => {
    const r = await crearObligacion({ unitId: "u1", period: "2026-08", amount: 0 });
    expect(r.ok).toBe(false);
    expect(mockObligation.create).not.toHaveBeenCalled();
  });

  it("da un error amigable si ya existe una obligación para esa unidad y período", async () => {
    mockObligation.create.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));

    const r = await crearObligacion({ unitId: "u1", period: "2026-08", amount: 145000 });

    expect(r.ok).toBe(false);
    expect(r.error).toContain("Ya existe una obligación");
  });

  it("nunca envía ningún campo de UnitOwner al crear — Obligation es exclusivamente de Unit", async () => {
    mockObligation.create.mockResolvedValue({ id: "ob-1" });
    await crearObligacion({ unitId: "u1", period: "2026-08", amount: 145000, concept: "Expensas" });

    const data = mockObligation.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("unitOwnerId");
    expect(data).not.toHaveProperty("ownerId");
    expect(data.unitId).toBe("u1");
  });
});

describe("actualizarObligacion", () => {
  it("actualiza solo los campos provistos", async () => {
    mockObligation.update.mockResolvedValue({});
    const r = await actualizarObligacion("ob-1", { amount: 150000 });
    expect(r.ok).toBe(true);
    expect(mockObligation.update).toHaveBeenCalledWith({
      where: { id: "ob-1" },
      data: { amount: 150000 },
    });
  });

  it("rechaza un período inválido al editar", async () => {
    const r = await actualizarObligacion("ob-1", { period: "invalido" });
    expect(r.ok).toBe(false);
    expect(mockObligation.update).not.toHaveBeenCalled();
  });
});

describe("eliminarObligacion — soft delete", () => {
  it("marca deletedAt en vez de borrar físicamente", async () => {
    mockObligation.update.mockResolvedValue({});
    const r = await eliminarObligacion("ob-1");
    expect(r.ok).toBe(true);
    expect(mockObligation.update).toHaveBeenCalledWith({
      where: { id: "ob-1" },
      data: { deletedAt: expect.any(Date) },
    });
  });
});

describe("listarObligaciones — relación con Unit", () => {
  it("filtra por unitId y deletedAt null, e incluye el código de la unidad", async () => {
    mockObligation.findMany.mockResolvedValue([
      {
        id: "ob-1",
        unitId: "u1",
        unit: { code: "3A" },
        period: new Date("2026-08-01"),
        amount: { toNumber: () => 145000 },
        paidAmount: { toNumber: () => 0 },
        status: "PENDING",
        concept: null,
        dueDate: null,
        externalRef: null,
      },
    ]);

    const r = await listarObligaciones("u1");

    expect(r.ok).toBe(true);
    expect(r.obligaciones[0].unitCode).toBe("3A");
    expect(mockObligation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { unitId: "u1", deletedAt: null } })
    );
  });
});

describe("importarObligaciones — resolución de Unit.code y no ambigüedad", () => {
  function fila(overrides: Partial<Record<string, string>> = {}) {
    return {
      unitCode: "3A",
      period: "2026-08",
      amount: "145000",
      concept: "Expensas Agosto",
      dueDate: "",
      ...overrides,
    };
  }

  it("crea una obligación nueva cuando el código de unidad existe en la organización", async () => {
    mockUnit.findMany.mockResolvedValue([{ id: "u1", code: "3A" }]);
    mockObligation.findUnique.mockResolvedValue(null);
    mockObligation.upsert.mockResolvedValue({});

    const r = await importarObligaciones("org1", [fila()]);

    expect(r.errores).toEqual([]);
    expect(r.creadas).toBe(1);
    expect(mockObligation.upsert).toHaveBeenCalledWith({
      where: { unitId_period: { unitId: "u1", period: new Date(Date.UTC(2026, 7, 1)) } },
      update: { amount: 145000, concept: "Expensas Agosto", dueDate: null },
      create: { unitId: "u1", period: new Date(Date.UTC(2026, 7, 1)), amount: 145000, concept: "Expensas Agosto", dueDate: null },
    });
  });

  it("actualiza (no duplica) cuando ya existe una obligación para esa unidad y período", async () => {
    mockUnit.findMany.mockResolvedValue([{ id: "u1", code: "3A" }]);
    mockObligation.findUnique.mockResolvedValue({ id: "ob-1" });
    mockObligation.upsert.mockResolvedValue({});

    const r = await importarObligaciones("org1", [fila()]);

    expect(r.creadas).toBe(0);
    expect(r.actualizadas).toBe(1);
  });

  it("rechaza la fila si el código de unidad no existe — nunca crea una Unidad ni adivina", async () => {
    mockUnit.findMany.mockResolvedValue([{ id: "u1", code: "5C" }]); // "3A" no está en el padrón
    const r = await importarObligaciones("org1", [fila({ unitCode: "3A" })]);

    expect(r.ok).toBe(false);
    expect(r.creadas).toBe(0);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].mensaje).toContain("No existe ninguna unidad activa");
    expect(mockObligation.upsert).not.toHaveBeenCalled();
  });

  it("rechaza la fila con período inválido sin tocar la base", async () => {
    mockUnit.findMany.mockResolvedValue([{ id: "u1", code: "3A" }]);
    const r = await importarObligaciones("org1", [fila({ period: "no-es-un-periodo" })]);

    expect(r.errores).toHaveLength(1);
    expect(mockObligation.upsert).not.toHaveBeenCalled();
  });

  it("rechaza la fila con importe inválido sin tocar la base", async () => {
    mockUnit.findMany.mockResolvedValue([{ id: "u1", code: "3A" }]);
    const r = await importarObligaciones("org1", [fila({ amount: "no-es-numero" })]);

    expect(r.errores).toHaveLength(1);
    expect(mockObligation.upsert).not.toHaveBeenCalled();
  });

  it("scopea la búsqueda de unidades a la organización dada, filtrando soft-deleted", async () => {
    mockUnit.findMany.mockResolvedValue([{ id: "u1", code: "3A" }]);
    mockObligation.findUnique.mockResolvedValue(null);
    mockObligation.upsert.mockResolvedValue({});

    await importarObligaciones("org1", [fila()]);

    expect(mockUnit.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org1", deletedAt: null },
      select: { id: true, code: true },
    });
  });
});
