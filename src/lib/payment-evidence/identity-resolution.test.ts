import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUnitOwner } = vi.hoisted(() => ({
  mockUnitOwner: { findMany: vi.fn() },
}));

const { resolverPorCuit } = await import("./identity-resolution");

const tx = { unitOwner: mockUnitOwner } as unknown as Parameters<typeof resolverPorCuit>[0];

beforeEach(() => {
  vi.clearAllMocks();
});

function activo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "owner-1",
    unitId: "unit-1",
    taxId: "20-12345678-9",
    unit: { organizationId: "org-1", deletedAt: null },
    ...overrides,
  };
}

describe("resolverPorCuit — mismo criterio de resolverTelefono, aplicado a CUIT", () => {
  it("SINGLE_CANDIDATE cuando el CUIT pertenece a un único titular", async () => {
    mockUnitOwner.findMany.mockResolvedValue([activo()]);

    const r = await resolverPorCuit(tx, "20-12345678-9");

    expect(r.case).toBe("SINGLE_CANDIDATE");
    expect(r.candidates[0].unitOwnerId).toBe("owner-1");
  });

  it("UNKNOWN cuando el CUIT no está registrado en ningún titular", async () => {
    mockUnitOwner.findMany.mockResolvedValue([]);
    const r = await resolverPorCuit(tx, "20-00000000-0");
    expect(r.case).toBe("UNKNOWN");
    expect(r.candidates).toHaveLength(0);
  });

  it("AMBIGUOUS_ACROSS_ORGS cuando el mismo CUIT aparece en más de una organización", async () => {
    mockUnitOwner.findMany.mockResolvedValue([
      activo({ id: "owner-1", unit: { organizationId: "org-1", deletedAt: null } }),
      activo({ id: "owner-2", unitId: "unit-9", unit: { organizationId: "org-2", deletedAt: null } }),
    ]);

    const r = await resolverPorCuit(tx, "20-12345678-9");

    expect(r.case).toBe("AMBIGUOUS_ACROSS_ORGS");
    expect(r.candidates).toHaveLength(2); // nunca elige uno al azar
  });

  it("ignora titulares con unidad soft-deleted", async () => {
    mockUnitOwner.findMany.mockResolvedValue([activo({ unit: { organizationId: "org-1", deletedAt: new Date() } })]);
    const r = await resolverPorCuit(tx, "20-12345678-9");
    expect(r.case).toBe("UNKNOWN");
  });

  it("normaliza el CUIT (ignora guiones/espacios) para comparar", async () => {
    mockUnitOwner.findMany.mockResolvedValue([activo({ taxId: "20123456789" })]);
    const r = await resolverPorCuit(tx, "20-12345678-9");
    expect(r.case).toBe("SINGLE_CANDIDATE");
  });

  it("CUIT vacío nunca escanea nada — UNKNOWN inmediato", async () => {
    const r = await resolverPorCuit(tx, "");
    expect(r.case).toBe("UNKNOWN");
    expect(mockUnitOwner.findMany).not.toHaveBeenCalled();
  });
});
