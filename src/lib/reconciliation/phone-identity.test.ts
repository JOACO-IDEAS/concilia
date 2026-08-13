import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUnitOwner } = vi.hoisted(() => ({
  mockUnitOwner: { findMany: vi.fn() },
}));

const { resolverTelefono, normalizarTelefono } = await import("./phone-identity");

const tx = { unitOwner: mockUnitOwner } as unknown as Parameters<typeof resolverTelefono>[0];

beforeEach(() => {
  vi.clearAllMocks();
});

function activo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "owner-1",
    unitId: "unit-1",
    phone: "5491122334455",
    unit: { organizationId: "org-1", deletedAt: null },
    ...overrides,
  };
}

describe("normalizarTelefono", () => {
  it("deja solo dígitos, mismo criterio que whatsapp-client.ts", () => {
    expect(normalizarTelefono("+54 9 11 2233-4455")).toBe("5491122334455");
  });
});

// Caso #6: teléfono único.
describe("resolverTelefono — teléfono único (#6)", () => {
  it("clasifica SINGLE_CANDIDATE cuando el teléfono pertenece a un solo titular", async () => {
    mockUnitOwner.findMany.mockResolvedValue([activo()]);

    const r = await resolverTelefono(tx, "+54 9 11 2233-4455");

    expect(r.case).toBe("SINGLE_CANDIDATE");
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].unitOwnerId).toBe("owner-1");
  });

  it("clasifica UNKNOWN cuando el teléfono no está registrado en ningún titular", async () => {
    mockUnitOwner.findMany.mockResolvedValue([]);
    const r = await resolverTelefono(tx, "5491100000000");
    expect(r.case).toBe("UNKNOWN");
    expect(r.candidates).toHaveLength(0);
  });
});

// Caso #8: teléfono compartido (varios titulares/unidades dentro de la MISMA organización — familiar, portero, administrador de hecho).
describe("resolverTelefono — teléfono compartido dentro de una organización (#8)", () => {
  it("clasifica AMBIGUOUS_WITHIN_ORG cuando el mismo teléfono está en 2+ titulares de la misma organización", async () => {
    mockUnitOwner.findMany.mockResolvedValue([
      activo({ id: "owner-1", unitId: "unit-1" }),
      activo({ id: "owner-2", unitId: "unit-2" }),
    ]);

    const r = await resolverTelefono(tx, "5491122334455");

    expect(r.case).toBe("AMBIGUOUS_WITHIN_ORG");
    expect(r.candidates).toHaveLength(2);
  });
});

// Caso #7: teléfono ambiguo entre organizaciones distintas — el caso más grave, ni siquiera se puede anclar la organización.
describe("resolverTelefono — teléfono ambiguo entre organizaciones (#7)", () => {
  it("clasifica AMBIGUOUS_ACROSS_ORGS cuando el teléfono aparece en más de una organización", async () => {
    mockUnitOwner.findMany.mockResolvedValue([
      activo({ id: "owner-1", unitId: "unit-1", unit: { organizationId: "org-1", deletedAt: null } }),
      activo({ id: "owner-2", unitId: "unit-9", unit: { organizationId: "org-2", deletedAt: null } }),
    ]);

    const r = await resolverTelefono(tx, "5491122334455");

    expect(r.case).toBe("AMBIGUOUS_ACROSS_ORGS");
  });

  it("nunca elige un candidato al azar entre organizaciones distintas", async () => {
    mockUnitOwner.findMany.mockResolvedValue([
      activo({ id: "owner-1", unit: { organizationId: "org-1", deletedAt: null } }),
      activo({ id: "owner-2", unit: { organizationId: "org-2", deletedAt: null } }),
    ]);

    const r = await resolverTelefono(tx, "5491122334455");

    // Sigue devolviendo TODOS los candidatos, nunca "elige" uno.
    expect(r.candidates).toHaveLength(2);
  });
});

describe("resolverTelefono — ignora titulares/unidades soft-deleted", () => {
  it("no cuenta un candidato cuya unidad está eliminada", async () => {
    mockUnitOwner.findMany.mockResolvedValue([
      activo({ id: "owner-1", unit: { organizationId: "org-1", deletedAt: new Date() } }),
    ]);

    const r = await resolverTelefono(tx, "5491122334455");

    expect(r.case).toBe("UNKNOWN");
  });
});
