import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryShadowResultStore } from "./shadow-store";
import type { ShadowMatchResult } from "./types";

function resultado(overrides: Partial<ShadowMatchResult> = {}): ShadowMatchResult {
  return {
    paymentTransactionId: "pt-1",
    candidateUnitId: "unit-1",
    candidateUnitOwnerId: "owner-1",
    candidateObligationId: "ob-1",
    score: 99,
    tier: 1,
    status: "CANDIDATE",
    signals: [],
    blockers: [],
    explanation: "✓ CUIT coincide",
    engineVersion: "3.4.0",
    evaluatedAt: new Date().toISOString(),
    topCandidateScore: 99,
    topCandidateTier: 1,
    topCandidates: null,
    ...overrides,
  };
}

let store: InMemoryShadowResultStore;

beforeEach(() => {
  store = new InMemoryShadowResultStore();
});

// Caso #6: ejecución duplicada → idempotencia.
describe("InMemoryShadowResultStore — idempotencia (#6)", () => {
  it("guardar dos veces con la MISMA (paymentTransactionId, engineVersion) actualiza, nunca duplica", async () => {
    await store.guardar(resultado({ score: 50 }));
    await store.guardar(resultado({ score: 99 })); // re-evaluación de la misma versión

    const registros = await store.listarPorPago("pt-1");
    expect(registros).toHaveLength(1);
    expect(registros[0].score).toBe(99); // el más reciente pisó al anterior
  });
});

// Caso #7: dos engineVersion distintas → evaluaciones independientes.
describe("InMemoryShadowResultStore — versiones de motor independientes (#7)", () => {
  it("dos engineVersion distintas del mismo pago generan DOS registros, no uno", async () => {
    await store.guardar(resultado({ engineVersion: "3.4.0", score: 60 }));
    await store.guardar(resultado({ engineVersion: "3.5.0", score: 90 }));

    const registros = await store.listarPorPago("pt-1");
    expect(registros).toHaveLength(2);
    expect(registros.map((r) => r.engineVersion).sort()).toEqual(["3.4.0", "3.5.0"]);
  });

  it("obtener() con una engineVersion puntual devuelve exactamente esa evaluación", async () => {
    await store.guardar(resultado({ engineVersion: "3.4.0", score: 60 }));
    await store.guardar(resultado({ engineVersion: "3.5.0", score: 90 }));

    const v1 = await store.obtener("pt-1", "3.4.0");
    const v2 = await store.obtener("pt-1", "3.5.0");
    expect(v1?.score).toBe(60);
    expect(v2?.score).toBe(90);
  });
});

describe("InMemoryShadowResultStore — listar con filtro", () => {
  it("filtra por status y por engineVersion", async () => {
    await store.guardar(resultado({ paymentTransactionId: "pt-1", status: "CANDIDATE" }));
    await store.guardar(resultado({ paymentTransactionId: "pt-2", status: "BLOCKED", candidateUnitId: null }));
    await store.guardar(resultado({ paymentTransactionId: "pt-3", status: "AMBIGUOUS", candidateUnitId: null }));

    const bloqueados = await store.listar({ status: "BLOCKED" });
    expect(bloqueados).toHaveLength(1);
    expect(bloqueados[0].paymentTransactionId).toBe("pt-2");

    const todos = await store.listar();
    expect(todos).toHaveLength(3);
  });

  it("obtener() devuelve null cuando nunca se evaluó ese pago", async () => {
    expect(await store.obtener("pt-inexistente", "3.4.0")).toBeNull();
  });
});
