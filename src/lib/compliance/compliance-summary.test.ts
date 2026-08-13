import { beforeEach, describe, expect, it, vi } from "vitest";

interface FilaObs {
  id: string;
  agentType: string;
  type: string;
  severity: string;
  status: string;
  providerId: string | null;
  providerDocumentId: string | null;
  organizationId: string | null;
  paymentTransactionId: string | null;
  explanation: string;
  evidence: unknown;
  suggestedAction: string | null;
  source: string;
  confidence: number | null;
  dedupeKey: string;
  detectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface FilaDocumento {
  organizationId: string | null;
  validTo: Date | null;
  deletedAt: Date | null;
  providerOrgs: string[];
}

const { mockTx, obsStore, docs } = vi.hoisted(() => {
  const obsStore = new Map<string, FilaObs>();
  const docs: FilaDocumento[] = [];
  // prov-1 sirve a org-a; documentos con organizationId=null se resuelven vía este vínculo.
  const vinculos: { providerId: string; organizationId: string }[] = [{ providerId: "prov-1", organizationId: "org-a" }];

  const fakeAgentObservation = {
    findMany: vi.fn(async ({ where = {} }: { where?: { status?: string; agentType?: string } } = {}) =>
      [...obsStore.values()].filter(
        (o) => (where.status === undefined || o.status === where.status) && (where.agentType === undefined || o.agentType === where.agentType)
      )
    ),
  };
  const fakeProvider = { findMany: vi.fn(async () => [{ id: "prov-1", name: "Proveedor Test" }]) };
  const fakeProviderOrganization = {
    findMany: vi.fn(async ({ where }: { where: { providerId: { in: string[] } } }) => vinculos.filter((v) => where.providerId.in.includes(v.providerId))),
  };
  const fakeOrganization = { findMany: vi.fn(async () => [{ id: "org-a", name: "[FIXTURE] Consorcio Alfa" }]) };

  const fakeProviderDocument = {
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: {
          deletedAt: null;
          OR: { organizationId: string | null; provider?: { organizations: { some: { organizationId: string; activo: boolean } } } }[];
        };
      }) =>
        docs
          .filter((d) => d.deletedAt === null)
          .filter((d) =>
            where.OR.some((clause) =>
              clause.organizationId !== null
                ? d.organizationId === clause.organizationId
                : d.organizationId === null && d.providerOrgs.includes(clause.provider!.organizations.some.organizationId)
            )
          )
          .map((d) => ({ validTo: d.validTo }))
    ),
  };

  const mockTx = {
    agentObservation: fakeAgentObservation,
    provider: fakeProvider,
    providerOrganization: fakeProviderOrganization,
    organization: fakeOrganization,
    providerDocument: fakeProviderDocument,
  };
  return { mockTx, obsStore, docs };
});

const { obtenerResumenComplianceDeConsorcio } = await import("./compliance-summary");

function observacion(overrides: Partial<FilaObs> = {}): FilaObs {
  return {
    id: `obs-${Math.random()}`,
    agentType: "COMPLIANCE",
    type: "DOCUMENT_EXPIRED",
    severity: "CRITICAL",
    status: "OPEN",
    providerId: "prov-1",
    providerDocumentId: "doc-1",
    organizationId: null,
    paymentTransactionId: null,
    explanation: "x",
    evidence: {},
    suggestedAction: null,
    source: "compliance:document-status",
    confidence: null,
    dedupeKey: `key-${Math.random()}`,
    detectedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const AHORA = new Date("2026-08-10T00:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  obsStore.clear();
  docs.length = 0;
});

describe("obtenerResumenComplianceDeConsorcio — números reales por consorcio", () => {
  it("cuenta documentos por estado derivado real: vigente, por vencer, vencido, sin vencimiento", async () => {
    docs.push({ organizationId: "org-a", validTo: new Date("2027-01-01"), deletedAt: null, providerOrgs: [] }); // vigente
    docs.push({ organizationId: "org-a", validTo: new Date("2026-08-15"), deletedAt: null, providerOrgs: [] }); // por vencer (5 días)
    docs.push({ organizationId: "org-a", validTo: new Date("2026-01-01"), deletedAt: null, providerOrgs: [] }); // vencido
    docs.push({ organizationId: "org-a", validTo: null, deletedAt: null, providerOrgs: [] }); // sin vencimiento

    const resumen = await obtenerResumenComplianceDeConsorcio(mockTx as never, "org-a", { ahora: AHORA });

    expect(resumen).toMatchObject({
      organizationId: "org-a",
      documentosVigentes: 1,
      documentosPorVencer: 1,
      documentosVencidos: 1,
      documentosSinVencimiento: 1,
    });
  });

  it("incluye documentos reutilizables (organizationId=null) de un proveedor vinculado a esta organización", async () => {
    docs.push({ organizationId: null, validTo: new Date("2027-01-01"), deletedAt: null, providerOrgs: ["org-a"] });
    const resumen = await obtenerResumenComplianceDeConsorcio(mockTx as never, "org-a", { ahora: AHORA });
    expect(resumen.documentosVigentes).toBe(1);
  });

  it("nunca cuenta documentos de OTRA organización — aislamiento real", async () => {
    docs.push({ organizationId: "org-b", validTo: new Date("2027-01-01"), deletedAt: null, providerOrgs: [] });
    const resumen = await obtenerResumenComplianceDeConsorcio(mockTx as never, "org-a", { ahora: AHORA });
    expect(resumen.documentosVigentes).toBe(0);
  });

  it("cuenta solo observaciones de Compliance abiertas para ese consorcio (reusa obtenerBandejaDeTrabajo, no duplica la resolución de organización)", async () => {
    obsStore.set("k1", observacion({ organizationId: "org-a", type: "DOCUMENT_EXPIRED" }));
    obsStore.set("k2", observacion({ organizationId: "org-a", status: "RESOLVED" })); // resuelta, no cuenta

    const resumen = await obtenerResumenComplianceDeConsorcio(mockTx as never, "org-a", { ahora: AHORA });
    expect(resumen.observacionesAbiertas).toBe(1);
  });

  it("sin datos, devuelve ceros honestos, no undefined ni error", async () => {
    const resumen = await obtenerResumenComplianceDeConsorcio(mockTx as never, "org-a", { ahora: AHORA });
    expect(resumen).toEqual({
      organizationId: "org-a",
      documentosVigentes: 0,
      documentosPorVencer: 0,
      documentosVencidos: 0,
      documentosSinVencimiento: 0,
      observacionesAbiertas: 0,
    });
  });
});
