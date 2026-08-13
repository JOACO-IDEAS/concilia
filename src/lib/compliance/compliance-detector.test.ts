import { beforeEach, describe, expect, it, vi } from "vitest";

// Fase 4 Parte D — mismo patrón ya establecido (shadow-store-prisma.test.ts,
// provider-compliance-query.test.ts): delegate de Prisma FALSO en memoria,
// con semántica real de upsert/findMany/updateMany, nunca contra Neon.

interface FilaProvider {
  id: string;
  name: string;
  deletedAt: Date | null;
  organizations: { organizationId: string }[];
  documents: { id: string; type: string; validTo: Date | null; organizationId: string | null }[];
}

interface FilaAgentObservation {
  id: string;
  agentType: string;
  type: string;
  severity: string;
  status: string;
  providerId: string | null;
  providerDocumentId: string | null;
  organizationId: string | null;
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

const {
  fakeAgentObservation,
  fakePaymentTransaction,
  fakeReconciliationMatch,
  fakeObligation,
  fakeUnitOwner,
  mockPrisma,
  providersFixture,
  agentObservationsStore,
} = vi.hoisted(() => {
  const providersFixture: FilaProvider[] = [];
  const agentObservationsStore = new Map<string, FilaAgentObservation>();
  let contador = 0;

  const fakeProvider = {
    findMany: vi.fn(async () => providersFixture.filter((p) => p.deletedAt === null)),
  };

  const fakeAgentObservation = {
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { dedupeKey: string };
        create: Omit<FilaAgentObservation, "id" | "createdAt" | "updatedAt">;
        update: Partial<FilaAgentObservation>;
      }) => {
        const existente = agentObservationsStore.get(where.dedupeKey);
        if (existente) {
          const actualizada = { ...existente, ...update, updatedAt: new Date() };
          agentObservationsStore.set(where.dedupeKey, actualizada);
          return actualizada;
        }
        contador++;
        const nueva = { id: `obs-${contador}`, createdAt: new Date(), updatedAt: new Date(), ...create } as FilaAgentObservation;
        agentObservationsStore.set(where.dedupeKey, nueva);
        return nueva;
      }
    ),
    findMany: vi.fn(async ({ where = {} }: { where?: { status?: string; agentType?: string } } = {}) => {
      return [...agentObservationsStore.values()].filter(
        (o) => (where.status === undefined || o.status === where.status) && (where.agentType === undefined || o.agentType === where.agentType)
      );
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { agentType?: string; source?: string; status?: string; dedupeKey?: { notIn: string[] } };
        data: Partial<FilaAgentObservation>;
      }) => {
        let count = 0;
        for (const [key, o] of agentObservationsStore.entries()) {
          if (where.agentType !== undefined && o.agentType !== where.agentType) continue;
          if (where.source !== undefined && o.source !== where.source) continue;
          if (where.status !== undefined && o.status !== where.status) continue;
          if (where.dedupeKey?.notIn?.includes(o.dedupeKey)) continue;
          agentObservationsStore.set(key, { ...o, ...data });
          count++;
        }
        return { count };
      }
    ),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  // Espías de "ausencia de escrituras peligrosas" — el detector NUNCA debe
  // llamar a estos métodos, sin importar qué encuentre.
  const fakePaymentTransaction = { create: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const fakeReconciliationMatch = { create: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const fakeObligation = { create: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const fakeUnitOwner = { create: vi.fn(), update: vi.fn(), delete: vi.fn() };

  const mockPrisma = {
    provider: fakeProvider,
    agentObservation: fakeAgentObservation,
    paymentTransaction: fakePaymentTransaction,
    reconciliationMatch: fakeReconciliationMatch,
    obligation: fakeObligation,
    unitOwner: fakeUnitOwner,
  };

  return {
    fakeProvider,
    fakeAgentObservation,
    fakePaymentTransaction,
    fakeReconciliationMatch,
    fakeObligation,
    fakeUnitOwner,
    mockPrisma,
    providersFixture,
    agentObservationsStore,
  };
});

const { ejecutarAgenteDeControlOperativo } = await import("./compliance-detector");

const AHORA = new Date("2026-08-08T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  providersFixture.length = 0;
  agentObservationsStore.clear();

  providersFixture.push(
    {
      id: "prov-1",
      name: "Ascensores SA",
      deletedAt: null,
      organizations: [{ organizationId: "org-a" }],
      documents: [
        { id: "doc-1", type: "ART", validTo: new Date("2026-01-01"), organizationId: null }, // vencido
        { id: "doc-2", type: "RC", validTo: new Date("2026-08-15"), organizationId: "org-a" }, // vence en 7 días
      ],
    },
    {
      id: "prov-2",
      name: "Seguros SRL",
      deletedAt: null,
      organizations: [{ organizationId: "org-a" }, { organizationId: "org-b" }], // múltiples organizaciones
      documents: [{ id: "doc-3", type: "AFIP", validTo: new Date("2026-12-01"), organizationId: null }], // vigente
    },
    {
      id: "prov-3",
      name: "Limpieza Total",
      deletedAt: null,
      organizations: [{ organizationId: "org-b" }],
      documents: [], // sin documentación, CON organización
    },
    {
      id: "prov-4",
      name: "Sin Vincular SA",
      deletedAt: null,
      organizations: [], // sin ninguna organización — nunca debería generar observación
      documents: [],
    },
    {
      id: "prov-5",
      name: "Matriculado Sin Vencimiento",
      deletedAt: null,
      organizations: [{ organizationId: "org-a" }],
      documents: [{ id: "doc-5", type: "MATRICULA", validTo: null, organizationId: null }], // sin vencimiento — no debe generar observación
    }
  );
});

describe("ejecutarAgenteDeControlOperativo — regla A: documento vencido", () => {
  it("genera DOCUMENT_EXPIRED con severidad CRITICAL y evidencia real", async () => {
    await ejecutarAgenteDeControlOperativo(mockPrisma as never, { ahora: AHORA });

    const obs = [...agentObservationsStore.values()].find((o) => o.type === "DOCUMENT_EXPIRED");
    expect(obs).toBeDefined();
    expect(obs?.severity).toBe("CRITICAL");
    expect(obs?.providerId).toBe("prov-1");
    expect(obs?.providerDocumentId).toBe("doc-1");
    expect(obs?.explanation).toContain("Ascensores SA");
    expect(obs?.explanation).toContain("ART");
    expect((obs?.evidence as Record<string, unknown>).documentId).toBe("doc-1");
    expect((obs?.evidence as Record<string, unknown>).validTo).toBe(new Date("2026-01-01").toISOString());
    expect(obs?.suggestedAction).toContain("renovación");
  });
});

describe("ejecutarAgenteDeControlOperativo — regla B: documento próximo a vencer", () => {
  it("genera DOCUMENT_EXPIRING_SOON con severidad WARNING y días calculados", async () => {
    await ejecutarAgenteDeControlOperativo(mockPrisma as never, { ahora: AHORA, ventanaDiasProximoAVencer: 30 });

    const obs = [...agentObservationsStore.values()].find((o) => o.type === "DOCUMENT_EXPIRING_SOON");
    expect(obs).toBeDefined();
    expect(obs?.severity).toBe("WARNING");
    expect(obs?.providerDocumentId).toBe("doc-2");
    expect(obs?.organizationId).toBe("org-a"); // hereda el organizationId específico del documento
    expect(obs?.explanation).toMatch(/vence en 7 días/);
    expect((obs?.evidence as Record<string, unknown>).diasParaVencer).toBe(7);
  });

  it("fuera de la ventana configurada, el mismo documento NO genera observación", async () => {
    await ejecutarAgenteDeControlOperativo(mockPrisma as never, { ahora: AHORA, ventanaDiasProximoAVencer: 2 });
    const obs = [...agentObservationsStore.values()].find((o) => o.providerDocumentId === "doc-2");
    expect(obs).toBeUndefined();
  });
});

describe("ejecutarAgenteDeControlOperativo — regla C: proveedor sin documentación", () => {
  it("genera PROVIDER_WITHOUT_DOCUMENTS cuando el proveedor tiene organización pero cero documentos", async () => {
    await ejecutarAgenteDeControlOperativo(mockPrisma as never, { ahora: AHORA });

    const obs = [...agentObservationsStore.values()].find((o) => o.type === "PROVIDER_WITHOUT_DOCUMENTS");
    expect(obs).toBeDefined();
    expect(obs?.providerId).toBe("prov-3");
    expect(obs?.severity).toBe("WARNING");
    expect(obs?.explanation).toContain("Limpieza Total");
  });

  it("un proveedor sin NINGUNA organización vinculada no genera ninguna observación", async () => {
    await ejecutarAgenteDeControlOperativo(mockPrisma as never, { ahora: AHORA });
    const obs = [...agentObservationsStore.values()].find((o) => o.providerId === "prov-4");
    expect(obs).toBeUndefined();
  });
});

describe("ejecutarAgenteDeControlOperativo — documento sin fecha de vencimiento", () => {
  it("un documento con validTo=null nunca genera DOCUMENT_EXPIRED ni DOCUMENT_EXPIRING_SOON", async () => {
    await ejecutarAgenteDeControlOperativo(mockPrisma as never, { ahora: AHORA });
    const obs = [...agentObservationsStore.values()].find((o) => o.providerDocumentId === "doc-5");
    expect(obs).toBeUndefined();
  });
});

describe("ejecutarAgenteDeControlOperativo — proveedor correctamente documentado", () => {
  it("un proveedor con documentos todos vigentes no genera ninguna observación", async () => {
    await ejecutarAgenteDeControlOperativo(mockPrisma as never, { ahora: AHORA });
    const obs = [...agentObservationsStore.values()].filter((o) => o.providerId === "prov-2");
    expect(obs).toHaveLength(0);
  });
});

describe("ejecutarAgenteDeControlOperativo — múltiples organizaciones del mismo proveedor", () => {
  it("un proveedor vinculado a 2 organizaciones no duplica observaciones por organización", async () => {
    // prov-2 está vinculado a org-a Y org-b, pero está correctamente
    // documentado — cero observaciones, de cualquier forma. Verificamos acá
    // que la evidencia de organizationIds múltiples viaja bien si en cambio
    // no tuviera documentación (mismo proveedor, escenario alterado):
    providersFixture[1].documents = []; // ahora Seguros SRL no tiene documentos
    await ejecutarAgenteDeControlOperativo(mockPrisma as never, { ahora: AHORA });

    const observacionesDeProv2 = [...agentObservationsStore.values()].filter((o) => o.providerId === "prov-2");
    expect(observacionesDeProv2).toHaveLength(1); // UNA sola, no una por organización
    const evidencia = observacionesDeProv2[0].evidence as { organizationIds: string[] };
    expect(evidencia.organizationIds.sort()).toEqual(["org-a", "org-b"]);
  });
});

describe("ejecutarAgenteDeControlOperativo — idempotencia", () => {
  it("correr el detector dos veces con los mismos datos no duplica ninguna observación", async () => {
    await ejecutarAgenteDeControlOperativo(mockPrisma as never, { ahora: AHORA });
    const totalPrimeraCorrida = agentObservationsStore.size;

    await ejecutarAgenteDeControlOperativo(mockPrisma as never, { ahora: AHORA });
    expect(agentObservationsStore.size).toBe(totalPrimeraCorrida);
  });
});

describe("ejecutarAgenteDeControlOperativo — auto-resolución", () => {
  it("si la condición deja de cumplirse (documento renovado), la observación pasa a RESOLVED", async () => {
    await ejecutarAgenteDeControlOperativo(mockPrisma as never, { ahora: AHORA });
    const antes = [...agentObservationsStore.values()].find((o) => o.providerDocumentId === "doc-1");
    expect(antes?.status).toBe("OPEN");

    // Se "renueva" el documento vencido.
    providersFixture[0].documents[0] = { id: "doc-1", type: "ART", validTo: new Date("2027-01-01"), organizationId: null };

    const resultado = await ejecutarAgenteDeControlOperativo(mockPrisma as never, { ahora: AHORA });

    const despues = [...agentObservationsStore.values()].find((o) => o.providerDocumentId === "doc-1" && o.type === "DOCUMENT_EXPIRED");
    expect(despues?.status).toBe("RESOLVED");
    expect(resultado.observacionesResueltas).toBeGreaterThanOrEqual(1);
  });
});

describe("ejecutarAgenteDeControlOperativo — separación observación/propuesta/acción", () => {
  it("cada observación tiene evidencia, severidad y propuesta, pero ningún campo ejecutable", async () => {
    await ejecutarAgenteDeControlOperativo(mockPrisma as never, { ahora: AHORA });

    for (const obs of agentObservationsStore.values()) {
      expect(obs.evidence).toBeDefined();
      expect(["INFO", "WARNING", "CRITICAL"]).toContain(obs.severity);
      expect(typeof obs.suggestedAction === "string" || obs.suggestedAction === null).toBe(true);
      // `suggestedAction` es siempre texto — nunca una función ni una referencia ejecutable.
      if (obs.suggestedAction !== null) expect(typeof obs.suggestedAction).toBe("string");
    }
  });

  it("imposibilidad de acción externa — el resultado no expone ningún mecanismo de ejecución", async () => {
    const resultado = await ejecutarAgenteDeControlOperativo(mockPrisma as never, { ahora: AHORA });
    expect(resultado).toEqual({
      observacionesGeneradas: expect.any(Number),
      observacionesResueltas: expect.any(Number),
    });
    expect(Object.keys(resultado).sort()).toEqual(["observacionesGeneradas", "observacionesResueltas"]);
  });
});

describe("ejecutarAgenteDeControlOperativo — ausencia de escrituras peligrosas", () => {
  it("nunca llama a create/update/delete de PaymentTransaction, ReconciliationMatch, Obligation ni UnitOwner", async () => {
    await ejecutarAgenteDeControlOperativo(mockPrisma as never, { ahora: AHORA });

    for (const fake of [fakePaymentTransaction, fakeReconciliationMatch, fakeObligation, fakeUnitOwner]) {
      expect(fake.create).not.toHaveBeenCalled();
      expect(fake.update).not.toHaveBeenCalled();
      expect(fake.delete).not.toHaveBeenCalled();
    }
  });

  it("la única escritura real es agentObservation.upsert/updateMany — nunca create/update/delete directos", async () => {
    await ejecutarAgenteDeControlOperativo(mockPrisma as never, { ahora: AHORA });

    expect(fakeAgentObservation.upsert).toHaveBeenCalled();
    expect(fakeAgentObservation.create).not.toHaveBeenCalled();
    expect(fakeAgentObservation.update).not.toHaveBeenCalled();
    expect(fakeAgentObservation.delete).not.toHaveBeenCalled();
  });
});
