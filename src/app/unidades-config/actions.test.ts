import { beforeEach, describe, expect, it, vi } from "vitest";

// Estos Server Actions escriben contra Prisma real — para no tocar Neon
// (ni siquiera en dev/test), se mockea el cliente y se verifica la
// secuencia exacta de llamadas que cada acción dispara sobre `tx`. `vi.hoisted`
// es necesario porque `vi.mock` se hoistea por encima de los imports.
const { mockUnit, mockUnitOwner, mockTransaction } = vi.hoisted(() => {
  const mockUnit = {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  };
  const mockUnitOwner = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  };
  type Tx = { unit: typeof mockUnit; unitOwner: typeof mockUnitOwner };
  const tx: Tx = { unit: mockUnit, unitOwner: mockUnitOwner };
  const mockTransaction = vi.fn((cb: (tx: Tx) => unknown) => cb(tx));
  return { mockUnit, mockUnitOwner, mockTransaction };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
    unit: mockUnit,
    unitOwner: mockUnitOwner,
  },
}));
vi.mock("@/lib/auth/organization-access", () => ({ requireOrganizationAccess: vi.fn(async () => ({ organizationId: "org1" })) }));
vi.mock("@/lib/auth/resource-access", () => ({
  requireUnitAccess: vi.fn(async () => ({ organizationId: "org1", unit: { id: "u1" } })),
  requireUnitOwnerAccess: vi.fn(async () => ({ organizationId: "org1", owner: { id: "owner-1" } })),
}));
vi.mock("@/lib/auth/session", () => ({ requireCurrentAdministrator: vi.fn(async () => ({ id: "admin-1" })) }));

const { crearUnidad, eliminarUnidad, agregarTitular, actualizarTitular, importarUnidades } =
  await import("./actions");

function filaUnidad(overrides: Partial<Record<string, string>> = {}) {
  return {
    unitCode: "3A",
    ownerFullName: "Juan Perez",
    ownerTaxId: "20123456786",
    ownerRelationship: "Propietario",
    ownerEmail: "",
    ownerPhone: "",
    coefficient: "",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ----------------------------------------------------------------------------
// Riesgo #2 — soft-delete de Unidad debe cascadear a sus Titulares activos.
// ----------------------------------------------------------------------------
describe("eliminarUnidad — cascada a titulares (riesgo #2)", () => {
  it("soft-deletea la Unidad y a todos sus titulares activos en la misma transacción", async () => {
    mockUnit.update.mockResolvedValue({ id: "u1" });
    mockUnitOwner.updateMany.mockResolvedValue({ count: 2 });

    const r = await eliminarUnidad("u1");

    expect(r.ok).toBe(true);
    expect(mockUnit.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(mockUnitOwner.updateMany).toHaveBeenCalledWith({
      where: { unitId: "u1", deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });
});

// ----------------------------------------------------------------------------
// Riesgo #3 — recrear una Unidad con el código de una ya eliminada.
// ----------------------------------------------------------------------------
describe("crearUnidad — recreación de código tras soft-delete (riesgo #3)", () => {
  it("si el código está ocupado por una unidad eliminada, la renombra (preserva historial) y crea una nueva activa", async () => {
    mockUnit.findUnique.mockResolvedValue({ id: "old-1", code: "3A", deletedAt: new Date("2026-01-01") });
    mockUnit.update.mockResolvedValue({});
    mockUnit.create.mockResolvedValue({ id: "new-1", code: "3A" });

    const r = await crearUnidad({ organizationId: "org1", code: "3A" });

    expect(r.ok).toBe(true);
    expect(mockUnit.update).toHaveBeenCalledWith({
      where: { id: "old-1" },
      data: { code: "3A__eliminada-old-1" },
    });
    expect(mockUnit.create).toHaveBeenCalledWith({
      data: { organizationId: "org1", code: "3A", coefficient: null },
    });
  });

  it("si el código está ocupado por una unidad ACTIVA, no renombra nada — el conflicto debe fallar", async () => {
    mockUnit.findUnique.mockResolvedValue({ id: "active-1", code: "3A", deletedAt: null });
    mockUnit.create.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));

    const r = await crearUnidad({ organizationId: "org1", code: "3A" });

    expect(r.ok).toBe(false);
    expect(r.error).toContain("Ya existe una unidad activa");
    expect(mockUnit.update).not.toHaveBeenCalled();
  });

  it("crea una unidad nueva sin conflicto, sin tocar nada más", async () => {
    mockUnit.findUnique.mockResolvedValue(null);
    mockUnit.create.mockResolvedValue({ id: "u1" });

    const r = await crearUnidad({ organizationId: "org1", code: "5C" });

    expect(r.ok).toBe(true);
    expect(mockUnit.update).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// Riesgo #4 — importarUnidades no debe revivir en silencio una Unidad
// soft-deleted encontrada por (organizationId, code).
// ----------------------------------------------------------------------------
describe("importarUnidades — Unidad soft-deleted encontrada durante import (riesgo #4)", () => {
  it("no revive la unidad eliminada: le libera el código y crea una unidad nueva", async () => {
    mockUnit.findUnique.mockResolvedValue({ id: "old-1", code: "3A", deletedAt: new Date() });
    mockUnit.update.mockResolvedValue({});
    mockUnit.create.mockResolvedValue({ id: "new-1" });
    mockUnitOwner.findFirst.mockResolvedValue(null);
    mockUnitOwner.create.mockResolvedValue({ id: "owner-1" });

    const resultado = await importarUnidades("org1", [filaUnidad()]);

    expect(resultado.errores).toEqual([]);
    expect(resultado.creadas).toBe(1);
    expect(resultado.actualizadas).toBe(0);
    expect(mockUnit.update).toHaveBeenCalledWith({
      where: { id: "old-1" },
      data: { code: "3A__eliminada-old-1" },
    });
    expect(mockUnit.create).toHaveBeenCalledWith({
      data: { organizationId: "org1", code: "3A", coefficient: null },
    });
    // Nunca debe intentar "reactivar" la unidad vieja tocándole deletedAt.
    for (const llamada of mockUnit.update.mock.calls) {
      expect(llamada[0].data).not.toHaveProperty("deletedAt");
    }
  });

  it("si la unidad existente está activa, la actualiza normalmente (comportamiento preexistente sin cambios)", async () => {
    mockUnit.findUnique.mockResolvedValue({ id: "u1", code: "3A", deletedAt: null });
    mockUnit.update.mockResolvedValue({ id: "u1" });
    mockUnitOwner.findUnique.mockResolvedValue({ id: "owner-1" });
    mockUnitOwner.update.mockResolvedValue({});

    const resultado = await importarUnidades("org1", [filaUnidad()]);

    expect(resultado.creadas).toBe(0);
    expect(resultado.actualizadas).toBe(1);
    expect(mockUnit.create).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// Riesgo #5 — a lo sumo un titular primario activo por Unidad.
// ----------------------------------------------------------------------------
describe("agregarTitular / actualizarTitular — invariante de un solo primario (riesgo #5)", () => {
  it("el primer titular activo de una unidad se crea como primario por defecto", async () => {
    mockUnitOwner.findFirst.mockResolvedValue(null);
    mockUnitOwner.updateMany.mockResolvedValue({ count: 0 });
    mockUnitOwner.create.mockResolvedValue({ id: "o1" });

    await agregarTitular("u1", { fullName: "Juan Perez" });

    expect(mockUnitOwner.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPrimary: true }) })
    );
  });

  it("un segundo titular NO desplaza por defecto al primario existente", async () => {
    mockUnitOwner.findFirst.mockResolvedValue({ id: "existing-owner" });
    mockUnitOwner.create.mockResolvedValue({ id: "o2" });

    await agregarTitular("u1", { fullName: "Maria Gonzalez" });

    expect(mockUnitOwner.updateMany).not.toHaveBeenCalled();
    expect(mockUnitOwner.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPrimary: false }) })
    );
  });

  it("pedir isPrimary=true explícito desmarca a cualquier otro primario activo de la unidad", async () => {
    mockUnitOwner.updateMany.mockResolvedValue({ count: 1 });
    mockUnitOwner.create.mockResolvedValue({ id: "o3" });

    await agregarTitular("u1", { fullName: "Nuevo Primario", isPrimary: true });

    expect(mockUnitOwner.updateMany).toHaveBeenCalledWith({
      where: { unitId: "u1", deletedAt: null, isPrimary: true },
      data: { isPrimary: false },
    });
  });

  it("actualizarTitular con isPrimary=true desmarca a los demás, excluyéndose a sí mismo", async () => {
    mockUnitOwner.findUniqueOrThrow.mockResolvedValue({ unitId: "u1" });
    mockUnitOwner.updateMany.mockResolvedValue({ count: 1 });
    mockUnitOwner.update.mockResolvedValue({});

    await actualizarTitular("owner-2", { isPrimary: true });

    expect(mockUnitOwner.updateMany).toHaveBeenCalledWith({
      where: { unitId: "u1", deletedAt: null, isPrimary: true, id: { not: "owner-2" } },
      data: { isPrimary: false },
    });
  });

  it("actualizarTitular sin tocar isPrimary no desmarca a nadie", async () => {
    mockUnitOwner.update.mockResolvedValue({});

    await actualizarTitular("owner-2", { fullName: "Nuevo Nombre" });

    expect(mockUnitOwner.updateMany).not.toHaveBeenCalled();
    expect(mockUnitOwner.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

describe("importarUnidades — invariante de un solo primario durante import (riesgo #5)", () => {
  it("si el archivo trae dos titulares nuevos para la misma unidad, solo el primero queda primario", async () => {
    mockUnit.findUnique.mockResolvedValue({ id: "u1", code: "3A", deletedAt: null });
    mockUnit.update.mockResolvedValue({ id: "u1" });
    mockUnitOwner.findUnique.mockResolvedValue(null);
    mockUnitOwner.findFirst
      .mockResolvedValueOnce(null) // fila 1: sin titulares activos todavía -> será primario
      .mockResolvedValueOnce({ id: "owner-1" }); // fila 2: ya hay uno activo -> no será primario
    mockUnitOwner.create.mockResolvedValue({ id: "owner-x" });

    await importarUnidades("org1", [
      filaUnidad({ ownerFullName: "Juan Perez", ownerTaxId: "20123456786" }),
      filaUnidad({ ownerFullName: "Maria Gonzalez", ownerTaxId: "27123456789" }),
    ]);

    const llamadas = mockUnitOwner.create.mock.calls;
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0][0].data.isPrimary).toBe(true);
    expect(llamadas[1][0].data.isPrimary).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// Riesgo #1 — sin CUIT no hay clave confiable para deduplicar: se documenta
// la limitación y se verifica que el comportamiento (crear siempre) es
// intencional y estable, no un olvido.
// ----------------------------------------------------------------------------
describe("importarUnidades — titulares sin CUIT (riesgo #1, comportamiento documentado)", () => {
  it("reimportar el mismo titular sin CUIT crea una fila nueva cada vez (sin heurística de nombre)", async () => {
    mockUnit.findUnique.mockResolvedValue({ id: "u1", code: "3A", deletedAt: null });
    mockUnit.update.mockResolvedValue({ id: "u1" });
    mockUnitOwner.findFirst.mockResolvedValue({ id: "owner-existing" });
    mockUnitOwner.create.mockResolvedValue({ id: "owner-new" });

    const fila = filaUnidad({ ownerTaxId: "" });

    await importarUnidades("org1", [fila]);
    await importarUnidades("org1", [fila]);

    expect(mockUnitOwner.create).toHaveBeenCalledTimes(2);
    expect(mockUnitOwner.update).not.toHaveBeenCalled();
  });

  it("un titular CON CUIT se actualiza (upsert) en vez de duplicarse al reimportar — sin cambios respecto a Fase 2", async () => {
    mockUnit.findUnique.mockResolvedValue({ id: "u1", code: "3A", deletedAt: null });
    mockUnit.update.mockResolvedValue({ id: "u1" });
    mockUnitOwner.findUnique.mockResolvedValue({ id: "owner-1" });
    mockUnitOwner.update.mockResolvedValue({});

    await importarUnidades("org1", [filaUnidad()]);

    expect(mockUnitOwner.update).toHaveBeenCalledTimes(1);
    expect(mockUnitOwner.create).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// Fase 2.2 — el riesgo adicional detectado en la auditoría de Fase 2.1: un
// UnitOwner soft-deleted encontrado por (unitId, taxId) debe REACTIVARSE
// (decisión de negocio explícita, distinta de Unit), nunca duplicarse ni
// quedar "actualizado pero invisible".
// ----------------------------------------------------------------------------
describe("Fase 2.2 — reactivación de UnitOwner por CUIT", () => {
  it("1. UnitOwner activo + mismo CUIT -> se actualiza, no se duplica ni da error", async () => {
    mockUnitOwner.findUnique.mockResolvedValue({ id: "owner-1", deletedAt: null, isPrimary: false });
    mockUnitOwner.update.mockResolvedValue({});

    const r = await agregarTitular("u1", { fullName: "Juan Perez Actualizado", taxId: "20123456786" });

    expect(r.ok).toBe(true);
    expect(r.ownerId).toBe("owner-1");
    expect(mockUnitOwner.update).toHaveBeenCalledWith({
      where: { id: "owner-1" },
      data: { fullName: "Juan Perez Actualizado", relationship: "OWNER", email: null, phone: null },
    });
    expect(mockUnitOwner.create).not.toHaveBeenCalled();
  });

  it("2. UnitOwner soft-deleted + mismo CUIT -> se reactiva (deletedAt=null), no se crea un duplicado", async () => {
    mockUnitOwner.findUnique.mockResolvedValue({
      id: "owner-1",
      deletedAt: new Date("2026-01-01"),
      isPrimary: false,
    });
    mockUnitOwner.update.mockResolvedValue({});

    const r = await agregarTitular("u1", { fullName: "Juan Perez", taxId: "20123456786" });

    expect(r.ok).toBe(true);
    expect(r.ownerId).toBe("owner-1");
    expect(mockUnitOwner.update).toHaveBeenCalledWith({
      where: { id: "owner-1" },
      data: { fullName: "Juan Perez", relationship: "OWNER", email: null, phone: null, deletedAt: null },
    });
    expect(mockUnitOwner.create).not.toHaveBeenCalled();
  });

  it("3. UnitOwner inexistente + CUIT -> se crea uno nuevo", async () => {
    mockUnitOwner.findUnique.mockResolvedValue(null);
    mockUnitOwner.findFirst.mockResolvedValue(null);
    mockUnitOwner.create.mockResolvedValue({ id: "owner-nuevo" });

    const r = await agregarTitular("u1", { fullName: "Nuevo Titular", taxId: "20123456786" });

    expect(r.ok).toBe(true);
    expect(mockUnitOwner.create).toHaveBeenCalledWith({
      data: {
        unitId: "u1",
        taxId: "20123456786",
        fullName: "Nuevo Titular",
        relationship: "OWNER",
        email: null,
        phone: null,
        isPrimary: true,
      },
    });
  });

  it("4. UnitOwner sin CUIT -> comportamiento actual, sin buscar por (unitId, taxId)", async () => {
    mockUnitOwner.findFirst.mockResolvedValue({ id: "existing-owner" });
    mockUnitOwner.create.mockResolvedValue({ id: "owner-nuevo" });

    const r = await agregarTitular("u1", { fullName: "Sin Cuit" });

    expect(r.ok).toBe(true);
    expect(mockUnitOwner.findUnique).not.toHaveBeenCalled();
    expect(mockUnitOwner.create).toHaveBeenCalledWith({
      data: {
        unitId: "u1",
        fullName: "Sin Cuit",
        taxId: null,
        relationship: "OWNER",
        email: null,
        phone: null,
        isPrimary: false,
      },
    });
  });

  it("5. reactivar un titular que ERA primario desmarca a cualquier otro primario activo actual de la unidad", async () => {
    mockUnitOwner.findUnique.mockResolvedValue({ id: "owner-1", deletedAt: new Date(), isPrimary: true });
    mockUnitOwner.updateMany.mockResolvedValue({ count: 1 });
    mockUnitOwner.update.mockResolvedValue({});

    await agregarTitular("u1", { fullName: "Juan Perez", taxId: "20123456786" });

    expect(mockUnitOwner.updateMany).toHaveBeenCalledWith({
      where: { unitId: "u1", deletedAt: null, isPrimary: true, id: { not: "owner-1" } },
      data: { isPrimary: false },
    });
  });

  it("5b. reactivar un titular que NO era primario no desmarca a nadie", async () => {
    mockUnitOwner.findUnique.mockResolvedValue({ id: "owner-1", deletedAt: new Date(), isPrimary: false });
    mockUnitOwner.update.mockResolvedValue({});

    await agregarTitular("u1", { fullName: "Juan Perez", taxId: "20123456786" });

    expect(mockUnitOwner.updateMany).not.toHaveBeenCalled();
  });

  it("6. importar el mismo archivo dos veces con CUIT no duplica: la segunda vez actualiza", async () => {
    mockUnit.findUnique.mockResolvedValue({ id: "u1", code: "3A", deletedAt: null });
    mockUnit.update.mockResolvedValue({ id: "u1" });
    mockUnitOwner.findUnique
      .mockResolvedValueOnce(null) // primera importación: no existe todavía
      .mockResolvedValueOnce({ id: "owner-1", deletedAt: null, isPrimary: true }); // segunda: ya existe activo
    mockUnitOwner.findFirst.mockResolvedValue(null);
    mockUnitOwner.create.mockResolvedValue({ id: "owner-1" });
    mockUnitOwner.update.mockResolvedValue({});

    const fila = filaUnidad();
    await importarUnidades("org1", [fila]);
    await importarUnidades("org1", [fila]);

    expect(mockUnitOwner.create).toHaveBeenCalledTimes(1);
    expect(mockUnitOwner.update).toHaveBeenCalledTimes(1);
  });

  it("7. eliminarUnidad (soft-delete de Unit) sigue funcionando exactamente igual que en Fase 2.1", async () => {
    mockUnit.update.mockResolvedValue({ id: "u1" });
    mockUnitOwner.updateMany.mockResolvedValue({ count: 2 });

    const r = await eliminarUnidad("u1");

    expect(r.ok).toBe(true);
    expect(mockUnit.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(mockUnitOwner.updateMany).toHaveBeenCalledWith({
      where: { unitId: "u1", deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
