import { beforeEach, describe, expect, it, vi } from "vitest";

interface Fila {
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

const { mockPrisma, store } = vi.hoisted(() => {
  const store = new Map<string, Fila>();
  // Provider→Organization: prov-1 sirve a org-a Y org-b (múltiples
  // organizaciones); prov-2 sirve solo a org-b.
  const vinculos: { providerId: string; organizationId: string }[] = [
    { providerId: "prov-1", organizationId: "org-a" },
    { providerId: "prov-1", organizationId: "org-b" },
    { providerId: "prov-2", organizationId: "org-b" },
  ];

  const fakeAgentObservation = {
    findMany: vi.fn(async ({ where = {} }: { where?: { status?: string; agentType?: string } } = {}) => {
      return [...store.values()].filter(
        (o) => (where.status === undefined || o.status === where.status) && (where.agentType === undefined || o.agentType === where.agentType)
      );
    }),
  };

  const fakeProvider = {
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      [
        { id: "prov-1", name: "Ascensores SA" },
        { id: "prov-2", name: "Seguros SRL" },
      ].filter((p) => where.id.in.includes(p.id))
    ),
  };

  const fakeProviderOrganization = {
    findMany: vi.fn(async ({ where }: { where: { providerId: { in: string[] }; activo: boolean } }) =>
      vinculos.filter((v) => where.providerId.in.includes(v.providerId))
    ),
  };

  const fakeOrganization = {
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      [
        { id: "org-a", name: "Consorcio A" },
        { id: "org-b", name: "Consorcio B" },
      ].filter((o) => where.id.in.includes(o.id))
    ),
  };

  const mockPrisma = {
    agentObservation: fakeAgentObservation,
    provider: fakeProvider,
    providerOrganization: fakeProviderOrganization,
    organization: fakeOrganization,
  };
  return { mockPrisma, store, vinculos };
});

const { obtenerBandejaDeTrabajo, obtenerObservacionesRelacionadas } = await import("./work-queue");

function fila(overrides: Partial<Fila> = {}): Fila {
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

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
});

describe("obtenerBandejaDeTrabajo — agrupación por severidad y orden de prioridad", () => {
  it("cuenta CRITICAL abiertas como 'requierenAtencion' y WARNING/INFO abiertas como 'enSeguimiento'", async () => {
    store.set("k1", fila({ severity: "CRITICAL", dedupeKey: "k1" }));
    store.set("k2", fila({ severity: "WARNING", dedupeKey: "k2" }));
    store.set("k3", fila({ severity: "INFO", dedupeKey: "k3" }));

    const bandeja = await obtenerBandejaDeTrabajo(mockPrisma as never);

    expect(bandeja.requierenAtencion).toBe(1);
    expect(bandeja.enSeguimiento).toBe(2);
  });

  it("cuenta las RESOLVED por separado, nunca mezcladas con las abiertas", async () => {
    store.set("k1", fila({ severity: "CRITICAL", status: "OPEN", dedupeKey: "k1" }));
    store.set("k2", fila({ severity: "CRITICAL", status: "RESOLVED", dedupeKey: "k2" }));

    const bandeja = await obtenerBandejaDeTrabajo(mockPrisma as never);

    expect(bandeja.requierenAtencion).toBe(1);
    expect(bandeja.resueltas).toBe(1);
    expect(bandeja.observacionesResueltas).toHaveLength(1);
  });
});

describe("obtenerBandejaDeTrabajo — evidencia y propuesta viajan intactas", () => {
  it("cada observación en la bandeja conserva evidence/suggestedAction reales, sin alterarlos", async () => {
    store.set("k1", fila({ evidence: { type: "ART", validTo: "2026-01-01T00:00:00.000Z" }, suggestedAction: "Solicitar renovación" }));

    const bandeja = await obtenerBandejaDeTrabajo(mockPrisma as never);

    expect(bandeja.observacionesAbiertas[0].evidence).toEqual({ type: "ART", validTo: "2026-01-01T00:00:00.000Z" });
    expect(bandeja.observacionesAbiertas[0].suggestedAction).toBe("Solicitar renovación");
  });
});

describe("obtenerBandejaDeTrabajo — múltiples proveedores y múltiples organizaciones", () => {
  it("enriquece cada observación con el nombre real del proveedor", async () => {
    store.set("k1", fila({ providerId: "prov-1", dedupeKey: "k1" }));
    store.set("k2", fila({ providerId: "prov-2", dedupeKey: "k2" }));

    const bandeja = await obtenerBandejaDeTrabajo(mockPrisma as never);

    const nombres = bandeja.observacionesAbiertas.map((o) => o.providerName).sort();
    expect(nombres).toEqual(["Ascensores SA", "Seguros SRL"]);
  });

  it("una observación sin organizationId propio (proveedor con múltiples organizaciones) resuelve TODAS las organizaciones a las que sirve el proveedor", async () => {
    store.set("k1", fila({ providerId: "prov-1", organizationId: null, dedupeKey: "k1" }));

    const bandeja = await obtenerBandejaDeTrabajo(mockPrisma as never);

    expect(bandeja.observacionesAbiertas[0].organizationNames.sort()).toEqual(["Consorcio A", "Consorcio B"]);
  });

  it("una observación CON organizationId propio solo resuelve esa organización, no las demás del proveedor", async () => {
    store.set("k1", fila({ providerId: "prov-1", organizationId: "org-a", dedupeKey: "k1" }));

    const bandeja = await obtenerBandejaDeTrabajo(mockPrisma as never);

    expect(bandeja.observacionesAbiertas[0].organizationNames).toEqual(["Consorcio A"]);
  });
});

describe("obtenerBandejaDeTrabajo — filtro por organización (aislamiento)", () => {
  it("filtrando por org-a, solo aparecen observaciones de proveedores que sirven a org-a", async () => {
    store.set("k1", fila({ providerId: "prov-1", organizationId: null, dedupeKey: "k1" })); // prov-1 sirve org-a y org-b
    store.set("k2", fila({ providerId: "prov-2", organizationId: null, dedupeKey: "k2" })); // prov-2 sirve SOLO org-b

    const bandejaOrgA = await obtenerBandejaDeTrabajo(mockPrisma as never, { organizationId: "org-a" });
    expect(bandejaOrgA.observacionesAbiertas.map((o) => o.providerId)).toEqual(["prov-1"]);

    const bandejaOrgB = await obtenerBandejaDeTrabajo(mockPrisma as never, { organizationId: "org-b" });
    expect(bandejaOrgB.observacionesAbiertas.map((o) => o.providerId).sort()).toEqual(["prov-1", "prov-2"]);
  });

  it("aislamiento estricto — una observación específica de org-a nunca aparece filtrando por org-b", async () => {
    store.set("k1", fila({ providerId: "prov-1", organizationId: "org-a", dedupeKey: "k1" }));

    const bandejaOrgB = await obtenerBandejaDeTrabajo(mockPrisma as never, { organizationId: "org-b" });
    expect(bandejaOrgB.observacionesAbiertas).toHaveLength(0);
  });

  it("sin filtro, aparecen todas las observaciones sin importar la organización", async () => {
    store.set("k1", fila({ providerId: "prov-1", organizationId: "org-a", dedupeKey: "k1" }));
    store.set("k2", fila({ providerId: "prov-2", organizationId: "org-b", dedupeKey: "k2" }));

    const bandeja = await obtenerBandejaDeTrabajo(mockPrisma as never);
    expect(bandeja.observacionesAbiertas).toHaveLength(2);
  });
});

describe("obtenerObservacionesRelacionadas — cruce de contexto por organización (Fase 4.F)", () => {
  it("dos observaciones de agentes DISTINTOS que comparten organización se reportan como relacionadas", async () => {
    // prov-1 (COMPLIANCE) sirve a org-a y org-b — comparte org-a con k2.
    store.set("k1", fila({ agentType: "COMPLIANCE", providerId: "prov-1", organizationId: null, dedupeKey: "k1" }));
    // k2 (MATCHING) es específica de org-a, sin proveedor.
    store.set("k2", fila({ agentType: "MATCHING", providerId: null, organizationId: "org-a", dedupeKey: "k2", paymentTransactionId: "pago-1" }));

    const [obs1] = await listarObservacionesDeFixture("k1");
    const relacionadas = await obtenerObservacionesRelacionadas(mockPrisma as never, obs1.id);

    expect(relacionadas.map((r) => r.dedupeKey)).toEqual(["k2"]);
  });

  it("dos observaciones SIN organización en común no se reportan como relacionadas", async () => {
    store.set("k1", fila({ providerId: "prov-2", organizationId: null, dedupeKey: "k1" })); // prov-2 sirve SOLO org-b
    store.set("k2", fila({ providerId: null, organizationId: "org-a", dedupeKey: "k2" }));

    const [obs1] = await listarObservacionesDeFixture("k1");
    const relacionadas = await obtenerObservacionesRelacionadas(mockPrisma as never, obs1.id);

    expect(relacionadas).toHaveLength(0);
  });

  it("una observación sin ninguna organización resuelta nunca reporta relacionadas (no se puede cruzar sin dato real)", async () => {
    store.set("k1", fila({ providerId: null, organizationId: null, dedupeKey: "k1" }));
    store.set("k2", fila({ providerId: null, organizationId: null, dedupeKey: "k2" }));

    const [obs1] = await listarObservacionesDeFixture("k1");
    const relacionadas = await obtenerObservacionesRelacionadas(mockPrisma as never, obs1.id);

    expect(relacionadas).toHaveLength(0);
  });

  it("una observación RESUELTA nunca aparece como 'relacionada' de otra (solo abiertas)", async () => {
    store.set("k1", fila({ providerId: null, organizationId: "org-a", dedupeKey: "k1" }));
    store.set("k2", fila({ providerId: null, organizationId: "org-a", status: "RESOLVED", dedupeKey: "k2" }));

    const [obs1] = await listarObservacionesDeFixture("k1");
    const relacionadas = await obtenerObservacionesRelacionadas(mockPrisma as never, obs1.id);

    expect(relacionadas).toHaveLength(0);
  });
});

async function listarObservacionesDeFixture(dedupeKey: string) {
  const bandeja = await obtenerBandejaDeTrabajo(mockPrisma as never);
  return [...bandeja.observacionesAbiertas, ...bandeja.observacionesResueltas].filter((o) => o.dedupeKey === dedupeKey);
}

describe("obtenerBandejaDeTrabajo — panel vacío", () => {
  it("con cero observaciones, devuelve una bandeja vacía honesta, sin lanzar", async () => {
    const bandeja = await obtenerBandejaDeTrabajo(mockPrisma as never);
    expect(bandeja).toEqual({
      requierenAtencion: 0,
      enSeguimiento: 0,
      resueltas: 0,
      observacionesAbiertas: [],
      observacionesResueltas: [],
    });
  });
});
