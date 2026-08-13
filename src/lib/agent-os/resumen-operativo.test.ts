import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTx, shadowLogs, docs } = vi.hoisted(() => {
  const shadowLogs: { engineVersion: string; organizationId: string | null }[] = [];
  const docs: { organizationId: string | null; providerOrgs: string[]; deletedAt: Date | null }[] = [];

  const shadowMatchLog = {
    count: vi.fn(async ({ where }: { where: { engineVersion: string; paymentTransaction?: { organizationId: string } } }) =>
      shadowLogs.filter(
        (r) => r.engineVersion === where.engineVersion && (!where.paymentTransaction || r.organizationId === where.paymentTransaction.organizationId)
      ).length
    ),
  };

  const providerDocument = {
    count: vi.fn(
      async ({
        where,
      }: {
        where: { deletedAt: null; OR?: { organizationId: string | null; provider?: { organizations: { some: { organizationId: string; activo: boolean } } } }[] };
      }) =>
        docs.filter((d) => {
          if (d.deletedAt !== null) return false;
          if (!where.OR) return true;
          return where.OR.some((clause) => {
            if (clause.organizationId !== null) return d.organizationId === clause.organizationId;
            return d.organizationId === null && d.providerOrgs.includes(clause.provider!.organizations.some.organizationId);
          });
        }).length
    ),
  };

  const mockTx = { shadowMatchLog, providerDocument };
  return { mockTx, shadowLogs, docs };
});

const { obtenerResumenOperativo } = await import("./resumen-operativo");
const { MATCH_ENGINE_VERSION } = await import("@/lib/reconciliation/version");

beforeEach(() => {
  vi.clearAllMocks();
  shadowLogs.length = 0;
  docs.length = 0;
});

describe("obtenerResumenOperativo — números reales, nunca hardcodeados", () => {
  it("sin filtro, cuenta TODOS los ShadowMatchLog de la versión actual del motor", async () => {
    shadowLogs.push({ engineVersion: MATCH_ENGINE_VERSION, organizationId: "org-a" });
    shadowLogs.push({ engineVersion: MATCH_ENGINE_VERSION, organizationId: "org-b" });
    shadowLogs.push({ engineVersion: "3.4.0", organizationId: "org-a" }); // versión vieja, se ignora

    const resumen = await obtenerResumenOperativo(mockTx as never);
    expect(resumen.pagosAnalizados).toBe(2);
  });

  it("filtrando por organización, solo cuenta los pagos de esa organización", async () => {
    shadowLogs.push({ engineVersion: MATCH_ENGINE_VERSION, organizationId: "org-a" });
    shadowLogs.push({ engineVersion: MATCH_ENGINE_VERSION, organizationId: "org-b" });

    const resumen = await obtenerResumenOperativo(mockTx as never, { organizationId: "org-a" });
    expect(resumen.pagosAnalizados).toBe(1);
  });

  it("cuenta documentos específicos de la organización + documentos reutilizables (organizationId null) del proveedor vinculado", async () => {
    docs.push({ organizationId: "org-a", providerOrgs: [], deletedAt: null }); // específico de org-a
    docs.push({ organizationId: null, providerOrgs: ["org-a"], deletedAt: null }); // reutilizable, proveedor sirve a org-a
    docs.push({ organizationId: null, providerOrgs: ["org-b"], deletedAt: null }); // reutilizable, pero de OTRO proveedor/org

    const resumen = await obtenerResumenOperativo(mockTx as never, { organizationId: "org-a" });
    expect(resumen.documentosRevisados).toBe(2);
  });

  it("sin filtro, panel vacío devuelve ceros honestos, no undefined ni error", async () => {
    const resumen = await obtenerResumenOperativo(mockTx as never);
    expect(resumen).toEqual({ pagosAnalizados: 0, documentosRevisados: 0 });
  });
});
