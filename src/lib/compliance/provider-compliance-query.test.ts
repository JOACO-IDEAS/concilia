import { beforeEach, describe, expect, it, vi } from "vitest";

// Fase 4 Parte C — mismo patrón ya establecido en
// shadow-store-prisma.test.ts: un delegate de Prisma FALSO en memoria, con
// semántica real de filtrado, nunca contra Neon. Cubre los casos pedidos:
// creación lógica de Provider, relación ProviderOrganization, múltiples
// organizaciones para un mismo Provider, ProviderDocument, vencimiento,
// documentos sin vencimiento, RegulatoryRequirement, relación
// requisito/documentación, aislamiento entre organizaciones, y ausencia de
// escrituras (create/update/delete espiados, nunca deberían llamarse).

interface FilaProviderDocument {
  id: string;
  providerId: string;
  organizationId: string | null;
  requirementId: string | null;
  type: string;
  status: string;
  validTo: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
  provider: { name: string };
}

interface FilaProviderOrganization {
  id: string;
  providerId: string;
  organizationId: string;
  activo: boolean;
  provider: { id: string; name: string; taxId: string | null };
}

const { fakeProviderDocument, fakeProviderOrganization, mockPrisma, documentos, vinculos } = vi.hoisted(() => {
  const documentos: FilaProviderDocument[] = [];
  const vinculos: FilaProviderOrganization[] = [];

  const fakeProviderDocument = {
    findMany: vi.fn(async ({ where }: { where: { providerId: string; deletedAt: null; OR?: { organizationId: string | null }[] } }) => {
      return documentos.filter((d) => {
        if (d.providerId !== where.providerId) return false;
        if (d.deletedAt !== null) return false;
        if (where.OR) {
          return where.OR.some((cond) => d.organizationId === cond.organizationId);
        }
        return true;
      });
    }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const fakeProviderOrganization = {
    findMany: vi.fn(async ({ where }: { where: { organizationId: string } }) => {
      return vinculos.filter((v) => v.organizationId === where.organizationId);
    }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const mockPrisma = { providerDocument: fakeProviderDocument, providerOrganization: fakeProviderOrganization };
  return { fakeProviderDocument, fakeProviderOrganization, mockPrisma, documentos, vinculos };
});

const { obtenerDocumentosDeProveedor, obtenerProveedoresDeOrganizacion } = await import("./provider-compliance-query");

const AHORA = new Date("2026-08-08T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  documentos.length = 0;
  vinculos.length = 0;

  // Provider "Ascensores SA" (P1) trabaja para DOS organizaciones distintas
  // — caso "múltiples organizaciones para un mismo Provider" — sin
  // duplicar su identidad (una sola fila de Provider subyacente, ver
  // provider.id/name/taxId compartidos entre los dos vínculos).
  vinculos.push(
    { id: "po-1", providerId: "prov-1", organizationId: "org-a", activo: true, provider: { id: "prov-1", name: "Ascensores SA", taxId: "30-11111111-1" } },
    { id: "po-2", providerId: "prov-1", organizationId: "org-b", activo: true, provider: { id: "prov-1", name: "Ascensores SA", taxId: "30-11111111-1" } },
    { id: "po-3", providerId: "prov-2", organizationId: "org-a", activo: true, provider: { id: "prov-2", name: "Seguros SRL", taxId: "30-22222222-1" } }
  );

  documentos.push(
    // doc reutilizable (organizationId=null) del proveedor 1, vigente
    { id: "doc-1", providerId: "prov-1", organizationId: null, requirementId: "req-art", type: "ART", status: "ACTIVE", validTo: new Date("2026-12-01"), createdAt: new Date(), deletedAt: null, provider: { name: "Ascensores SA" } },
    // doc específico de org-a del proveedor 1, vencido
    { id: "doc-2", providerId: "prov-1", organizationId: "org-a", requirementId: null, type: "RC", status: "ACTIVE", validTo: new Date("2026-01-01"), createdAt: new Date(), deletedAt: null, provider: { name: "Ascensores SA" } },
    // doc específico de org-b del proveedor 1, sin vencimiento
    { id: "doc-3", providerId: "prov-1", organizationId: "org-b", requirementId: null, type: "MATRICULA", status: "ACTIVE", validTo: null, createdAt: new Date(), deletedAt: null, provider: { name: "Ascensores SA" } },
    // doc del proveedor 2 — nunca debería aparecer en consultas de prov-1
    { id: "doc-4", providerId: "prov-2", organizationId: null, requirementId: null, type: "AFIP", status: "ACTIVE", validTo: new Date("2026-12-01"), createdAt: new Date(), deletedAt: null, provider: { name: "Seguros SRL" } }
  );
});

describe("obtenerDocumentosDeProveedor — ProviderDocument + vencimiento", () => {
  it("sin filtro de organización, devuelve TODOS los documentos del proveedor (reutilizables + específicos de cualquier org)", async () => {
    const r = await obtenerDocumentosDeProveedor(mockPrisma as never, "prov-1", { ahora: AHORA });
    expect(r.map((d) => d.id).sort()).toEqual(["doc-1", "doc-2", "doc-3"]);
  });

  it("aislamiento entre organizaciones — scoped a org-a: incluye el reutilizable + el específico de org-a, nunca el de org-b", async () => {
    const r = await obtenerDocumentosDeProveedor(mockPrisma as never, "prov-1", { organizationId: "org-a", ahora: AHORA });
    expect(r.map((d) => d.id).sort()).toEqual(["doc-1", "doc-2"]);
    expect(r.some((d) => d.id === "doc-3")).toBe(false);
  });

  it("aislamiento entre organizaciones — scoped a org-b: incluye el reutilizable + el específico de org-b, nunca el de org-a", async () => {
    const r = await obtenerDocumentosDeProveedor(mockPrisma as never, "prov-1", { organizationId: "org-b", ahora: AHORA });
    expect(r.map((d) => d.id).sort()).toEqual(["doc-1", "doc-3"]);
    expect(r.some((d) => d.id === "doc-2")).toBe(false);
  });

  it("nunca devuelve documentos de OTRO proveedor", async () => {
    const r = await obtenerDocumentosDeProveedor(mockPrisma as never, "prov-1", { ahora: AHORA });
    expect(r.some((d) => d.providerId === "prov-2")).toBe(false);
  });

  it("vencimiento — calcula el estado real (VALID/EXPIRED) por documento", async () => {
    const r = await obtenerDocumentosDeProveedor(mockPrisma as never, "prov-1", { ahora: AHORA });
    expect(r.find((d) => d.id === "doc-1")?.estado).toBe("VALID");
    expect(r.find((d) => d.id === "doc-2")?.estado).toBe("EXPIRED");
  });

  it("documentos sin vencimiento — SIN_VENCIMIENTO, no VALID ni EXPIRED", async () => {
    const r = await obtenerDocumentosDeProveedor(mockPrisma as never, "prov-1", { ahora: AHORA });
    expect(r.find((d) => d.id === "doc-3")?.estado).toBe("SIN_VENCIMIENTO");
    expect(r.find((d) => d.id === "doc-3")?.validTo).toBeNull();
  });

  it("relación requisito/documentación — requirementId viaja tal cual, null cuando no aplica", async () => {
    const r = await obtenerDocumentosDeProveedor(mockPrisma as never, "prov-1", { ahora: AHORA });
    expect(r.find((d) => d.id === "doc-1")?.requirementId).toBe("req-art");
    expect(r.find((d) => d.id === "doc-2")?.requirementId).toBeNull();
  });

  it("creación lógica de Provider — el nombre/identidad del proveedor viaja correctamente en cada documento", async () => {
    const r = await obtenerDocumentosDeProveedor(mockPrisma as never, "prov-1", { ahora: AHORA });
    expect(r.every((d) => d.providerName === "Ascensores SA")).toBe(true);
  });
});

describe("obtenerProveedoresDeOrganizacion — ProviderOrganization + múltiples organizaciones", () => {
  it("múltiples organizaciones para un mismo Provider — prov-1 aparece en org-a Y en org-b, con la misma identidad", async () => {
    const enOrgA = await obtenerProveedoresDeOrganizacion(mockPrisma as never, "org-a");
    const enOrgB = await obtenerProveedoresDeOrganizacion(mockPrisma as never, "org-b");

    expect(enOrgA.some((p) => p.providerId === "prov-1" && p.providerName === "Ascensores SA")).toBe(true);
    expect(enOrgB.some((p) => p.providerId === "prov-1" && p.providerName === "Ascensores SA")).toBe(true);
  });

  it("aislamiento entre organizaciones — prov-2 solo trabaja para org-a, nunca aparece en org-b", async () => {
    const enOrgA = await obtenerProveedoresDeOrganizacion(mockPrisma as never, "org-a");
    const enOrgB = await obtenerProveedoresDeOrganizacion(mockPrisma as never, "org-b");

    expect(enOrgA.some((p) => p.providerId === "prov-2")).toBe(true);
    expect(enOrgB.some((p) => p.providerId === "prov-2")).toBe(false);
  });
});

describe("Fase 4 Parte C — ausencia de escrituras", () => {
  it("ninguna de las dos funciones de lectura llama jamás a create/update/delete", async () => {
    await obtenerDocumentosDeProveedor(mockPrisma as never, "prov-1", { ahora: AHORA });
    await obtenerProveedoresDeOrganizacion(mockPrisma as never, "org-a");

    expect(fakeProviderDocument.create).not.toHaveBeenCalled();
    expect(fakeProviderDocument.update).not.toHaveBeenCalled();
    expect(fakeProviderDocument.delete).not.toHaveBeenCalled();
    expect(fakeProviderOrganization.create).not.toHaveBeenCalled();
    expect(fakeProviderOrganization.update).not.toHaveBeenCalled();
    expect(fakeProviderOrganization.delete).not.toHaveBeenCalled();
  });
});
