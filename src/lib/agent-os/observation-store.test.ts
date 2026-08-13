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
  let contador = 0;

  const fakeAgentObservation = {
    upsert: vi.fn(async ({ where, create, update }: { where: { dedupeKey: string }; create: Omit<Fila, "id" | "createdAt" | "updatedAt">; update: Partial<Fila> }) => {
      const existente = store.get(where.dedupeKey);
      if (existente) {
        const actualizada = { ...existente, ...update, updatedAt: new Date() };
        store.set(where.dedupeKey, actualizada);
        return actualizada;
      }
      contador++;
      const nueva = { id: `obs-${contador}`, createdAt: new Date(), updatedAt: new Date(), ...create } as Fila;
      store.set(where.dedupeKey, nueva);
      return nueva;
    }),
    findMany: vi.fn(async ({ where = {} }: { where?: { status?: string; agentType?: string } } = {}) => {
      return [...store.values()].filter(
        (o) => (where.status === undefined || o.status === where.status) && (where.agentType === undefined || o.agentType === where.agentType)
      );
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { agentType?: string; source?: string; status?: string; dedupeKey?: { notIn: string[] } }; data: Partial<Fila> }) => {
      let count = 0;
      for (const [key, o] of store.entries()) {
        if (where.agentType !== undefined && o.agentType !== where.agentType) continue;
        if (where.source !== undefined && o.source !== where.source) continue;
        if (where.status !== undefined && o.status !== where.status) continue;
        if (where.dedupeKey?.notIn?.includes(o.dedupeKey)) continue;
        store.set(key, { ...o, ...data });
        count++;
      }
      return { count };
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      return [...store.values()].find((o) => o.id === where.id) ?? null;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Fila> }) => {
      for (const [key, o] of store.entries()) {
        if (o.id === where.id) {
          const actualizada = { ...o, ...data, updatedAt: new Date() };
          store.set(key, actualizada);
          return actualizada;
        }
      }
      throw new Error("no encontrado");
    }),
  };

  const mockPrisma = { agentObservation: fakeAgentObservation };
  return { fakeAgentObservation, mockPrisma, store };
});

const { guardarObservacion, resolverObservacionesNoConfirmadas, listarObservaciones, marcarComoAtendida, obtenerObservacionPorId } =
  await import("./observation-store");

function observacion(overrides: Partial<Parameters<typeof guardarObservacion>[1]> = {}) {
  return {
    agentType: "COMPLIANCE" as const,
    type: "DOCUMENT_EXPIRED" as const,
    severity: "CRITICAL" as const,
    providerId: "prov-1",
    providerDocumentId: "doc-1",
    organizationId: null,
    paymentTransactionId: null,
    explanation: "Documento vencido",
    evidence: { documentId: "doc-1" },
    suggestedAction: "Solicitar renovación",
    source: "compliance:document-status",
    confidence: null,
    dedupeKey: "COMPLIANCE:compliance:document-status:DOCUMENT_EXPIRED:doc:doc-1",
    detectedAt: "2026-08-08T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
});

describe("guardarObservacion — idempotencia por dedupeKey", () => {
  it("guardar dos veces la MISMA dedupeKey actualiza, nunca duplica", async () => {
    await guardarObservacion(mockPrisma as never, observacion({ explanation: "v1" }));
    await guardarObservacion(mockPrisma as never, observacion({ explanation: "v2" }));

    expect(store.size).toBe(1);
    expect([...store.values()][0].explanation).toBe("v2");
  });

  it("dos dedupeKey distintas generan dos filas independientes", async () => {
    await guardarObservacion(mockPrisma as never, observacion({ dedupeKey: "key-1" }));
    await guardarObservacion(mockPrisma as never, observacion({ dedupeKey: "key-2" }));
    expect(store.size).toBe(2);
  });

  it("una observación guardada siempre queda en status OPEN", async () => {
    await guardarObservacion(mockPrisma as never, observacion());
    expect([...store.values()][0].status).toBe("OPEN");
  });
});

describe("resolverObservacionesNoConfirmadas", () => {
  it("marca RESOLVED las observaciones OPEN no re-confirmadas en la corrida actual", async () => {
    await guardarObservacion(mockPrisma as never, observacion({ dedupeKey: "key-1" }));
    await guardarObservacion(mockPrisma as never, observacion({ dedupeKey: "key-2" }));

    const resueltas = await resolverObservacionesNoConfirmadas(mockPrisma as never, "COMPLIANCE", "compliance:document-status", ["key-1"]);

    expect(resueltas).toBe(1);
    expect(store.get("key-1")?.status).toBe("OPEN");
    expect(store.get("key-2")?.status).toBe("RESOLVED");
  });

  it("con lista vacía de vigentes, resuelve TODAS las observaciones OPEN de ese agente/source", async () => {
    await guardarObservacion(mockPrisma as never, observacion({ dedupeKey: "key-1" }));
    const resueltas = await resolverObservacionesNoConfirmadas(mockPrisma as never, "COMPLIANCE", "compliance:document-status", []);
    expect(resueltas).toBe(1);
    expect(store.get("key-1")?.status).toBe("RESOLVED");
  });
});

describe("listarObservaciones", () => {
  it("filtra por status y agentType", async () => {
    await guardarObservacion(mockPrisma as never, observacion({ dedupeKey: "key-1" }));
    await resolverObservacionesNoConfirmadas(mockPrisma as never, "COMPLIANCE", "compliance:document-status", []);

    const abiertas = await listarObservaciones(mockPrisma as never, { status: "OPEN" });
    const resueltas = await listarObservaciones(mockPrisma as never, { status: "RESOLVED" });
    expect(abiertas).toHaveLength(0);
    expect(resueltas).toHaveLength(1);
  });
});

// Fase 4 Parte E — primera interacción humana (§7 del pedido).
describe("marcarComoAtendida — primera interacción humana", () => {
  it("cambia el status de OPEN a RESOLVED de una observación puntual, por id", async () => {
    await guardarObservacion(mockPrisma as never, observacion({ dedupeKey: "key-1" }));
    const [creada] = await listarObservaciones(mockPrisma as never, { status: "OPEN" });

    await marcarComoAtendida(mockPrisma as never, creada.id);

    const leida = await obtenerObservacionPorId(mockPrisma as never, creada.id);
    expect(leida?.status).toBe("RESOLVED");
  });

  it("es seguro: si la condición real sigue vigente, la próxima re-detección la vuelve a abrir sola", async () => {
    await guardarObservacion(mockPrisma as never, observacion({ dedupeKey: "key-1" }));
    const [creada] = await listarObservaciones(mockPrisma as never, { status: "OPEN" });

    await marcarComoAtendida(mockPrisma as never, creada.id);
    expect((await obtenerObservacionPorId(mockPrisma as never, creada.id))?.status).toBe("RESOLVED");

    // El detector vuelve a correr y la condición TODAVÍA se cumple —
    // guardarObservacion siempre fuerza status="OPEN" en cada re-detección.
    await guardarObservacion(mockPrisma as never, observacion({ dedupeKey: "key-1" }));
    expect((await obtenerObservacionPorId(mockPrisma as never, creada.id))?.status).toBe("OPEN");
  });

  it("no modifica ningún otro campo de la observación (evidencia/explicación intactas)", async () => {
    await guardarObservacion(mockPrisma as never, observacion({ dedupeKey: "key-1", explanation: "explicación real" }));
    const [creada] = await listarObservaciones(mockPrisma as never, { status: "OPEN" });

    await marcarComoAtendida(mockPrisma as never, creada.id);

    const leida = await obtenerObservacionPorId(mockPrisma as never, creada.id);
    expect(leida?.explanation).toBe("explicación real");
    expect(leida?.evidence).toEqual({ documentId: "doc-1" });
  });
});

describe("obtenerObservacionPorId", () => {
  it("devuelve null si no existe", async () => {
    expect(await obtenerObservacionPorId(mockPrisma as never, "no-existe")).toBeNull();
  });
});
