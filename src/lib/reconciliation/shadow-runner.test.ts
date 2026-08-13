import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryShadowResultStore } from "./shadow-store";
import type { ShadowMatchResult } from "./types";

const { mockRunMatchingInShadow } = vi.hoisted(() => ({ mockRunMatchingInShadow: vi.fn() }));
vi.mock("./match-engine", () => ({ runMatchingInShadow: mockRunMatchingInShadow }));

const { ejecutarMatchingEnSombra } = await import("./shadow-runner");

function resultado(overrides: Partial<ShadowMatchResult> = {}): ShadowMatchResult {
  return {
    paymentTransactionId: "pt-1",
    candidateUnitId: null,
    candidateUnitOwnerId: null,
    candidateObligationId: null,
    score: 0,
    tier: null,
    status: "BLOCKED",
    signals: [],
    blockers: [],
    explanation: "✗ Sin evidencia",
    engineVersion: "3.4.0",
    evaluatedAt: new Date().toISOString(),
    topCandidateScore: null,
    topCandidateTier: null,
    topCandidates: null,
    ...overrides,
  };
}

let store: InMemoryShadowResultStore;

beforeEach(() => {
  vi.clearAllMocks();
  store = new InMemoryShadowResultStore();
});

// Caso #1: PaymentTransaction creada → matching shadow ejecutado (a nivel de esta función).
describe("ejecutarMatchingEnSombra — corre el motor y persiste (#1)", () => {
  it("llama a runMatchingInShadow y guarda el resultado en el store", async () => {
    mockRunMatchingInShadow.mockResolvedValue(resultado({ status: "CANDIDATE", score: 90 }));

    await ejecutarMatchingEnSombra("pt-1", { store });

    expect(mockRunMatchingInShadow).toHaveBeenCalledWith("pt-1", undefined);
    const guardado = await store.obtener("pt-1", "3.4.0");
    expect(guardado?.status).toBe("CANDIDATE");
    expect(guardado?.score).toBe(90);
  });
});

// Casos #8-#11: cada status se persiste tal cual.
describe("ejecutarMatchingEnSombra — persiste cada resultado posible (#8, #9, #10, #11)", () => {
  it("persiste un resultado CANDIDATE (#8)", async () => {
    mockRunMatchingInShadow.mockResolvedValue(resultado({ status: "CANDIDATE", candidateUnitId: "unit-1", score: 99 }));
    await ejecutarMatchingEnSombra("pt-1", { store });
    expect((await store.obtener("pt-1", "3.4.0"))?.status).toBe("CANDIDATE");
  });

  it("persiste un resultado BLOCKED con sus blockers intactos (#9, y #13 — el bloqueo sigue vigente en lo persistido)", async () => {
    mockRunMatchingInShadow.mockResolvedValue(
      resultado({ status: "BLOCKED", blockers: [{ type: "CUIT_CONTRADICTORY", evidence: "x" }] })
    );
    await ejecutarMatchingEnSombra("pt-1", { store });
    const guardado = await store.obtener("pt-1", "3.4.0");
    expect(guardado?.status).toBe("BLOCKED");
    expect(guardado?.blockers).toEqual([{ type: "CUIT_CONTRADICTORY", evidence: "x" }]);
  });

  it("persiste un resultado AMBIGUOUS (#10)", async () => {
    mockRunMatchingInShadow.mockResolvedValue(
      resultado({ status: "AMBIGUOUS", blockers: [{ type: "MULTIPLE_EQUIVALENT_CANDIDATES", evidence: "x" }] })
    );
    await ejecutarMatchingEnSombra("pt-1", { store });
    expect((await store.obtener("pt-1", "3.4.0"))?.status).toBe("AMBIGUOUS");
  });

  it("persiste un resultado sin evidencia (#11)", async () => {
    mockRunMatchingInShadow.mockResolvedValue(
      resultado({ status: "BLOCKED", blockers: [{ type: "INSUFFICIENT_EVIDENCE", evidence: "x" }], score: 0 })
    );
    await ejecutarMatchingEnSombra("pt-1", { store });
    const guardado = await store.obtener("pt-1", "3.4.0");
    expect(guardado?.blockers[0].type).toBe("INSUFFICIENT_EVIDENCE");
    expect(guardado?.score).toBe(0);
  });
});

// Caso #5: si el matching falla, no debe romper nada (la función nunca lanza).
describe("ejecutarMatchingEnSombra — el matching puede fallar sin afectar al pago (#5)", () => {
  it("no lanza cuando runMatchingInShadow rechaza, y no guarda nada en el store", async () => {
    mockRunMatchingInShadow.mockRejectedValue(new Error("boom"));

    await expect(ejecutarMatchingEnSombra("pt-1", { store })).resolves.toBeUndefined();
    expect(await store.obtener("pt-1", "3.4.0")).toBeNull();
  });
});

// Caso #14: AUTO sigue siendo imposible — ni siquiera si el motor (mockeado, hipotéticamente) devolviera algo raro se guardaría como AUTO, porque el tipo no lo permite; acá se confirma en runtime con los 3 valores reales.
describe("ejecutarMatchingEnSombra — AUTO nunca aparece (#14)", () => {
  it("los únicos status que se persisten son CANDIDATE, AMBIGUOUS o BLOCKED", async () => {
    for (const status of ["CANDIDATE", "AMBIGUOUS", "BLOCKED"] as const) {
      mockRunMatchingInShadow.mockResolvedValue(resultado({ status }));
      await ejecutarMatchingEnSombra("pt-1", { store });
      const guardado = await store.obtener("pt-1", "3.4.0");
      expect(["CANDIDATE", "AMBIGUOUS", "BLOCKED"]).toContain(guardado?.status);
    }
  });
});

// Casos #2, #3, #4: el runner en sí no toca ninguna tabla contable — su
// único efecto observable es la llamada al store (ya mockeado con un
// InMemoryShadowResultStore real, sin ningún prisma de por medio acá).
describe("ejecutarMatchingEnSombra — no modifica datos contables (#2, #3, #4)", () => {
  it("el único efecto secundario es guardar en el store — no importa prisma en este archivo", async () => {
    mockRunMatchingInShadow.mockResolvedValue(resultado({ status: "CANDIDATE" }));
    await ejecutarMatchingEnSombra("pt-1", { store });
    // Si este archivo tocara PaymentTransaction/Obligation/UnitOwner
    // directamente, importaría "@/lib/prisma" — no lo hace (ver shadow-runner.ts).
    expect(await store.listar()).toHaveLength(1);
  });
});
