import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryShadowResultStore } from "./shadow-store";
import type { ShadowMatchResult } from "./types";

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

interface FilaPago {
  id: string;
  organizationId: string | null;
  amount: { toNumber: () => number };
  transactionDate: Date | null;
  referenceNumber: string | null;
  concept: string | null;
}

const { mockTx, storeObs, pagos } = vi.hoisted(() => {
  const storeObs = new Map<string, FilaObs>();
  const pagos = new Map<string, FilaPago>();
  let contador = 0;

  const agentObservation = {
    upsert: vi.fn(async ({ where, create, update }: { where: { dedupeKey: string }; create: Omit<FilaObs, "id" | "createdAt" | "updatedAt">; update: Partial<FilaObs> }) => {
      const existente = storeObs.get(where.dedupeKey);
      if (existente) {
        const actualizada = { ...existente, ...update, updatedAt: new Date() };
        storeObs.set(where.dedupeKey, actualizada);
        return actualizada;
      }
      contador++;
      const nueva = { id: `obs-${contador}`, createdAt: new Date(), updatedAt: new Date(), ...create } as FilaObs;
      storeObs.set(where.dedupeKey, nueva);
      return nueva;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { agentType?: string; source?: string; status?: string; dedupeKey?: { notIn: string[] } }; data: Partial<FilaObs> }) => {
      let count = 0;
      for (const [key, o] of storeObs.entries()) {
        if (where.agentType !== undefined && o.agentType !== where.agentType) continue;
        if (where.source !== undefined && o.source !== where.source) continue;
        if (where.status !== undefined && o.status !== where.status) continue;
        if (where.dedupeKey?.notIn?.includes(o.dedupeKey)) continue;
        storeObs.set(key, { ...o, ...data });
        count++;
      }
      return { count };
    }),
    findMany: vi.fn(async ({ where = {} }: { where?: { status?: string; agentType?: string } } = {}) =>
      [...storeObs.values()].filter(
        (o) => (where.status === undefined || o.status === where.status) && (where.agentType === undefined || o.agentType === where.agentType)
      )
    ),
  };

  const paymentTransaction = {
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => [...pagos.values()].filter((p) => where.id.in.includes(p.id))),
  };

  const mockTx = { agentObservation, paymentTransaction };
  return { mockTx, storeObs, pagos };
});

const { ejecutarObservadorDeMatching } = await import("./matching-observer");

function monto(n: number) {
  return { toNumber: () => n };
}

function pago(overrides: Partial<FilaPago> = {}): FilaPago {
  return {
    id: `pago-${Math.random()}`,
    organizationId: "org-a",
    amount: monto(100000),
    transactionDate: null,
    referenceNumber: null,
    concept: null,
    ...overrides,
  };
}

function shadowResult(overrides: Partial<ShadowMatchResult> = {}): ShadowMatchResult {
  return {
    paymentTransactionId: "pago-x",
    candidateUnitId: null,
    candidateUnitOwnerId: null,
    candidateObligationId: null,
    score: 0,
    tier: null,
    status: "BLOCKED",
    signals: [],
    blockers: [{ type: "CUIT_CONTRADICTORY", evidence: "El CUIT del pago pertenece a otro titular." }],
    explanation: "✗ El CUIT del pago pertenece a otro titular.",
    engineVersion: "3.9.0",
    evaluatedAt: "2026-08-10T12:00:00.000Z",
    topCandidateScore: 62,
    topCandidateTier: 1,
    topCandidates: null,
    ...overrides,
  };
}

let store: InMemoryShadowResultStore;

beforeEach(() => {
  vi.clearAllMocks();
  storeObs.clear();
  pagos.clear();
  store = new InMemoryShadowResultStore();
});

describe("ejecutarObservadorDeMatching — genera observación solo para AMBIGUOUS/BLOCKED", () => {
  it("un ShadowMatchLog BLOCKED genera una observación CRITICAL con paymentTransactionId real", async () => {
    pagos.set("pago-1", pago({ id: "pago-1", organizationId: "org-a" }));
    await store.guardar(shadowResult({ paymentTransactionId: "pago-1", status: "BLOCKED" }));

    const resultado = await ejecutarObservadorDeMatching(mockTx as never, { store });

    expect(resultado.observacionesGeneradas).toBe(1);
    const [obs] = [...storeObs.values()];
    expect(obs.type).toBe("PAYMENT_MATCH_BLOCKED");
    expect(obs.severity).toBe("CRITICAL");
    expect(obs.paymentTransactionId).toBe("pago-1");
    expect(obs.organizationId).toBe("org-a");
    expect(obs.agentType).toBe("MATCHING");
  });

  it("un ShadowMatchLog AMBIGUOUS genera una observación WARNING", async () => {
    pagos.set("pago-2", pago({ id: "pago-2" }));
    await store.guardar(
      shadowResult({
        paymentTransactionId: "pago-2",
        status: "AMBIGUOUS",
        blockers: [{ type: "MULTIPLE_EQUIVALENT_CANDIDATES", evidence: "Hay 3 candidatos con evidencia comparable." }],
        explanation: "⚠ Hay 3 candidatos con evidencia comparable.",
      })
    );

    await ejecutarObservadorDeMatching(mockTx as never, { store });

    const [obs] = [...storeObs.values()];
    expect(obs.type).toBe("PAYMENT_MATCH_AMBIGUOUS");
    expect(obs.severity).toBe("WARNING");
  });

  it("un ShadowMatchLog CANDIDATE NUNCA genera una observación", async () => {
    pagos.set("pago-3", pago({ id: "pago-3" }));
    await store.guardar(shadowResult({ paymentTransactionId: "pago-3", status: "CANDIDATE", score: 99, tier: 1, blockers: [] }));

    const resultado = await ejecutarObservadorDeMatching(mockTx as never, { store });

    expect(resultado.observacionesGeneradas).toBe(0);
    expect(storeObs.size).toBe(0);
  });

  it("solo evalúa ShadowMatchLog de la versión ACTUAL del motor, ignora versiones viejas", async () => {
    pagos.set("pago-4", pago({ id: "pago-4" }));
    await store.guardar(shadowResult({ paymentTransactionId: "pago-4", status: "BLOCKED", engineVersion: "3.4.0" }));

    const resultado = await ejecutarObservadorDeMatching(mockTx as never, { store });

    expect(resultado.observacionesGeneradas).toBe(0);
  });
});

// Fase 5.2 — mejora 1 del plan de Fase 5.2: suggestedAction contextual para
// AMBIGUOUS, usando exclusivamente topCandidates real — nunca inventa
// candidatos ni nombres de propietarios.
describe("ejecutarObservadorDeMatching — suggestedAction contextual en AMBIGUOUS (Fase 5.2)", () => {
  it("con topCandidates reales y empatados, arma un texto con las UF reales en vez del genérico", async () => {
    pagos.set("pago-ambig-1", pago({ id: "pago-ambig-1" }));
    await store.guardar(
      shadowResult({
        paymentTransactionId: "pago-ambig-1",
        status: "AMBIGUOUS",
        blockers: [{ type: "MULTIPLE_EQUIVALENT_CANDIDATES", evidence: "Hay 2 candidatos con evidencia comparable." }],
        topCandidates: [
          { unitCode: "1A", score: 22, tier: 2, matchedSignals: ["AMOUNT_MATCH"] },
          { unitCode: "2B", score: 22, tier: 2, matchedSignals: ["AMOUNT_MATCH"] },
          { unitCode: "3A", score: 12, tier: 3, matchedSignals: ["AMOUNT_MATCH"] },
        ],
      })
    );

    await ejecutarObservadorDeMatching(mockTx as never, { store });

    const [obs] = [...storeObs.values()];
    expect(obs.suggestedAction).toBe("Revisar manualmente entre UF 1A y UF 2B — ninguna tiene evidencia claramente superior.");
    // el tercer candidato (score menor, no empatado) nunca se menciona
    expect(obs.suggestedAction).not.toContain("3A");
  });

  it("con 3 candidatos empatados en el mismo score, los lista a todos con 'y' antes del último", async () => {
    pagos.set("pago-ambig-2", pago({ id: "pago-ambig-2" }));
    await store.guardar(
      shadowResult({
        paymentTransactionId: "pago-ambig-2",
        status: "AMBIGUOUS",
        topCandidates: [
          { unitCode: "1A", score: 22, tier: 2, matchedSignals: [] },
          { unitCode: "2B", score: 22, tier: 2, matchedSignals: [] },
          { unitCode: "3C", score: 22, tier: 2, matchedSignals: [] },
        ],
      })
    );

    await ejecutarObservadorDeMatching(mockTx as never, { store });

    const [obs] = [...storeObs.values()];
    expect(obs.suggestedAction).toBe("Revisar manualmente entre UF 1A, UF 2B y UF 3C — ninguna tiene evidencia claramente superior.");
  });

  it("sin topCandidates (null), usa el texto genérico de siempre — nunca inventa candidatos", async () => {
    pagos.set("pago-ambig-3", pago({ id: "pago-ambig-3" }));
    await store.guardar(shadowResult({ paymentTransactionId: "pago-ambig-3", status: "AMBIGUOUS", topCandidates: null }));

    await ejecutarObservadorDeMatching(mockTx as never, { store });

    const [obs] = [...storeObs.values()];
    expect(obs.suggestedAction).toBe("Revisar el pago manualmente — hay más de un candidato posible y el motor no puede desempatar solo.");
  });

  it("con topCandidates pero SIN empate real de score, usa el texto genérico — nunca inventa un empate que no existe", async () => {
    pagos.set("pago-ambig-4", pago({ id: "pago-ambig-4" }));
    await store.guardar(
      shadowResult({
        paymentTransactionId: "pago-ambig-4",
        status: "AMBIGUOUS",
        topCandidates: [
          { unitCode: "1A", score: 30, tier: 2, matchedSignals: [] },
          { unitCode: "2B", score: 22, tier: 3, matchedSignals: [] },
        ],
      })
    );

    await ejecutarObservadorDeMatching(mockTx as never, { store });

    const [obs] = [...storeObs.values()];
    expect(obs.suggestedAction).toBe("Revisar el pago manualmente — hay más de un candidato posible y el motor no puede desempatar solo.");
  });

  it("BLOCKED nunca usa el texto contextual, aunque tenga topCandidates — la mejora es solo para AMBIGUOUS", async () => {
    pagos.set("pago-blocked-1", pago({ id: "pago-blocked-1" }));
    await store.guardar(
      shadowResult({
        paymentTransactionId: "pago-blocked-1",
        status: "BLOCKED",
        topCandidates: [{ unitCode: "1A", score: 62, tier: 1, matchedSignals: ["CUIT_EXACT"] }],
      })
    );

    await ejecutarObservadorDeMatching(mockTx as never, { store });

    const [obs] = [...storeObs.values()];
    expect(obs.suggestedAction).toBe("Revisar el pago manualmente — el motor de matching no pudo proponer un candidato seguro.");
  });
});

describe("ejecutarObservadorDeMatching — evidencia real, sin inventar identidades", () => {
  it("la evidencia conserva blockers/score/tier reales del ShadowMatchLog, nunca inventados", async () => {
    pagos.set("pago-5", pago({ id: "pago-5", amount: monto(500000) }));
    await store.guardar(
      shadowResult({
        paymentTransactionId: "pago-5",
        status: "BLOCKED",
        blockers: [{ type: "AMOUNT_INCOMPATIBLE", evidence: "Importe superior a lo esperado." }],
        topCandidateScore: 40,
        topCandidateTier: 1,
        topCandidates: [{ unitCode: "3B", score: 40, tier: 1, matchedSignals: ["CUIT_EXACT"] }],
      })
    );

    await ejecutarObservadorDeMatching(mockTx as never, { store });

    const [obs] = [...storeObs.values()];
    const evidence = obs.evidence as Record<string, unknown>;
    expect(evidence.amount).toBe(500000);
    expect(evidence.blockers).toEqual([{ type: "AMOUNT_INCOMPATIBLE", evidence: "Importe superior a lo esperado." }]);
    expect(evidence.topCandidateScore).toBe(40);
    expect(evidence.topCandidateTier).toBe(1);
    // Fase 5.1 — topCandidates viaja tal cual, con identidad real (UF), sin
    // que matching-observer.ts la recalcule ni la invente.
    expect(evidence.topCandidates).toEqual([{ unitCode: "3B", score: 40, tier: 1, matchedSignals: ["CUIT_EXACT"] }]);
    // Nunca se agrega un candidateUnitId/candidateUnitOwnerId inventado —
    // eso solo existe cuando status=CANDIDATE (winner real), nunca se copia
    // artificialmente para BLOCKED/AMBIGUOUS.
    expect(evidence).not.toHaveProperty("candidateUnitId");
    expect(evidence).not.toHaveProperty("candidateUnitOwnerId");
  });

  it("no inventa una relación PaymentTransaction → Provider: la observación nunca tiene providerId", async () => {
    pagos.set("pago-6", pago({ id: "pago-6" }));
    await store.guardar(shadowResult({ paymentTransactionId: "pago-6", status: "BLOCKED" }));

    await ejecutarObservadorDeMatching(mockTx as never, { store });

    const [obs] = [...storeObs.values()];
    expect(obs.providerId).toBeNull();
    expect(obs.providerDocumentId).toBeNull();
  });

  it("reutiliza el organizationId REAL del pago — null si el pago no tiene organización resuelta, nunca inventado", async () => {
    pagos.set("pago-7", pago({ id: "pago-7", organizationId: null }));
    await store.guardar(shadowResult({ paymentTransactionId: "pago-7", status: "BLOCKED" }));

    await ejecutarObservadorDeMatching(mockTx as never, { store });

    const [obs] = [...storeObs.values()];
    expect(obs.organizationId).toBeNull();
  });

  it("si el pago fue borrado (no existe en PaymentTransaction), no genera observación sin evidencia real", async () => {
    // deliberadamente NO se agrega a `pagos`
    await store.guardar(shadowResult({ paymentTransactionId: "pago-fantasma", status: "BLOCKED" }));

    const resultado = await ejecutarObservadorDeMatching(mockTx as never, { store });

    expect(resultado.observacionesGeneradas).toBe(0);
  });
});

describe("ejecutarObservadorDeMatching — idempotencia", () => {
  it("correr dos veces sobre el mismo ShadowMatchLog actualiza, nunca duplica", async () => {
    pagos.set("pago-8", pago({ id: "pago-8" }));
    await store.guardar(shadowResult({ paymentTransactionId: "pago-8", status: "BLOCKED" }));

    await ejecutarObservadorDeMatching(mockTx as never, { store });
    await ejecutarObservadorDeMatching(mockTx as never, { store });

    expect(storeObs.size).toBe(1);
  });

  it("si el pago se re-evalúa y pasa a CANDIDATE, la observación existente se auto-resuelve", async () => {
    pagos.set("pago-9", pago({ id: "pago-9" }));
    await store.guardar(shadowResult({ paymentTransactionId: "pago-9", status: "BLOCKED" }));
    await ejecutarObservadorDeMatching(mockTx as never, { store });

    let [obs] = [...storeObs.values()];
    expect(obs.status).toBe("OPEN");

    // El motor se vuelve a correr (ej. datos corregidos) y ahora resuelve CANDIDATE.
    store._clear();
    await store.guardar(shadowResult({ paymentTransactionId: "pago-9", status: "CANDIDATE", score: 90, tier: 1, blockers: [] }));
    await ejecutarObservadorDeMatching(mockTx as never, { store });

    [obs] = [...storeObs.values()];
    expect(obs.status).toBe("RESOLVED");
  });

  it("si el pago sigue BLOCKED en la siguiente corrida, la observación se re-confirma (sigue OPEN)", async () => {
    pagos.set("pago-10", pago({ id: "pago-10" }));
    await store.guardar(shadowResult({ paymentTransactionId: "pago-10", status: "BLOCKED" }));
    await ejecutarObservadorDeMatching(mockTx as never, { store });
    await ejecutarObservadorDeMatching(mockTx as never, { store });

    const [obs] = [...storeObs.values()];
    expect(obs.status).toBe("OPEN");
  });
});

describe("ejecutarObservadorDeMatching — aislamiento por organización", () => {
  it("un pago de org-a nunca queda con el organizationId de org-b", async () => {
    pagos.set("pago-11", pago({ id: "pago-11", organizationId: "org-a" }));
    pagos.set("pago-12", pago({ id: "pago-12", organizationId: "org-b" }));
    await store.guardar(shadowResult({ paymentTransactionId: "pago-11", status: "BLOCKED" }));
    await store.guardar(shadowResult({ paymentTransactionId: "pago-12", status: "AMBIGUOUS" }));

    await ejecutarObservadorDeMatching(mockTx as never, { store });

    const porPago = new Map([...storeObs.values()].map((o) => [o.paymentTransactionId, o.organizationId]));
    expect(porPago.get("pago-11")).toBe("org-a");
    expect(porPago.get("pago-12")).toBe("org-b");
  });
});
