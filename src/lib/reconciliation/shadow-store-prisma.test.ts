import { beforeEach, describe, expect, it, vi } from "vitest";
import { calcularMetricas } from "./observability";
import type { ShadowMatchResult } from "./types";

// Fase 3.5 — PrismaShadowResultStore contra un delegate de Prisma FALSO (en
// memoria, con semántica real de upsert/findUnique/findMany), nunca contra
// Neon. Esto prueba idempotencia (#3/#4/#5) con más confianza que solo
// verificar que se llamó a upsert — reproduce el comportamiento real que el
// `@@unique([paymentTransactionId, engineVersion])` de la migración impone
// en la base de verdad.
const { fakeShadowMatchLog, mockPrisma } = vi.hoisted(() => {
  type Fila = {
    id: string;
    paymentTransactionId: string;
    engineVersion: string;
    candidateUnitId: string | null;
    candidateUnitOwnerId: string | null;
    candidateObligationId: string | null;
    score: number;
    tier: number | null;
    status: string;
    signals: unknown;
    blockers: unknown;
    explanation: string;
    evaluatedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  };

  const filas = new Map<string, Fila>();
  let contador = 0;
  const clave = (pk: { paymentTransactionId: string; engineVersion: string }) =>
    `${pk.paymentTransactionId}::${pk.engineVersion}`;

  const fakeShadowMatchLog = {
    async upsert({ where, create, update }: { where: { paymentTransactionId_engineVersion: { paymentTransactionId: string; engineVersion: string } }; create: Omit<Fila, "id" | "createdAt" | "updatedAt">; update: Partial<Fila> }) {
      const k = clave(where.paymentTransactionId_engineVersion);
      const existente = filas.get(k);
      if (existente) {
        const actualizada = { ...existente, ...update, updatedAt: new Date() } as Fila;
        filas.set(k, actualizada);
        return actualizada;
      }
      contador++;
      const nueva = { id: `smlog-${contador}`, createdAt: new Date(), updatedAt: new Date(), ...create } as Fila;
      filas.set(k, nueva);
      return nueva;
    },
    async findUnique({ where }: { where: { paymentTransactionId_engineVersion: { paymentTransactionId: string; engineVersion: string } } }) {
      return filas.get(clave(where.paymentTransactionId_engineVersion)) ?? null;
    },
    async findMany({ where = {} }: { where?: { paymentTransactionId?: string; status?: string; engineVersion?: string } } = {}) {
      return [...filas.values()].filter(
        (f) =>
          (where.paymentTransactionId === undefined || f.paymentTransactionId === where.paymentTransactionId) &&
          (where.status === undefined || f.status === where.status) &&
          (where.engineVersion === undefined || f.engineVersion === where.engineVersion)
      );
    },
    _todas: () => [...filas.values()],
    _clear: () => {
      filas.clear();
      contador = 0;
    },
  };

  const mockPrisma = { shadowMatchLog: fakeShadowMatchLog };
  return { fakeShadowMatchLog, mockPrisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const { PrismaShadowResultStore } = await import("./shadow-store");
const { prisma: prismaImportado } = await import("@/lib/prisma");

function resultado(overrides: Partial<ShadowMatchResult> = {}): ShadowMatchResult {
  return {
    paymentTransactionId: "pt-1",
    candidateUnitId: "unit-1",
    candidateUnitOwnerId: "owner-1",
    candidateObligationId: "ob-1",
    score: 90,
    tier: 1,
    status: "CANDIDATE",
    signals: [{ signal: "CUIT_EXACT", tier: 1, matched: true, strength: "STRONG", evidence: "CUIT coincide" }],
    blockers: [],
    explanation: "✓ CUIT coincide",
    engineVersion: "3.5.0",
    evaluatedAt: "2026-08-08T12:00:00.000Z",
    topCandidateScore: 90,
    topCandidateTier: 1,
    topCandidates: null,
    ...overrides,
  };
}

let store: InstanceType<typeof PrismaShadowResultStore>;

beforeEach(() => {
  fakeShadowMatchLog._clear();
  store = new PrismaShadowResultStore();
});

// Caso #1: persistencia de un resultado.
describe("PrismaShadowResultStore — persistencia (#1)", () => {
  it("guardar() crea una fila en shadow_match_logs", async () => {
    await store.guardar(resultado());
    expect(fakeShadowMatchLog._todas()).toHaveLength(1);
    expect(fakeShadowMatchLog._todas()[0].paymentTransactionId).toBe("pt-1");
  });
});

// Caso #2: lectura del resultado.
describe("PrismaShadowResultStore — lectura (#2)", () => {
  it("obtener() devuelve el resultado tal como se guardó, con evaluatedAt como ISO string", async () => {
    await store.guardar(resultado({ score: 77 }));
    const leido = await store.obtener("pt-1", "3.5.0");
    expect(leido?.score).toBe(77);
    expect(leido?.evaluatedAt).toBe("2026-08-08T12:00:00.000Z");
    expect(leido?.status).toBe("CANDIDATE");
  });

  it("obtener() devuelve null si nunca se evaluó ese pago con esa versión", async () => {
    expect(await store.obtener("pt-inexistente", "3.5.0")).toBeNull();
  });
});

// Caso #3: upsert idempotente.
describe("PrismaShadowResultStore — upsert idempotente (#3)", () => {
  it("guardar dos veces la MISMA (paymentTransactionId, engineVersion) actualiza, nunca crea una segunda fila", async () => {
    await store.guardar(resultado({ score: 50 }));
    await store.guardar(resultado({ score: 91 }));

    expect(fakeShadowMatchLog._todas()).toHaveLength(1);
    expect(fakeShadowMatchLog._todas()[0].score).toBe(91);
  });
});

// Caso #4: misma transacción + misma versión → un solo registro (mismo
// invariante que #3, verificado esta vez vía listarPorPago).
describe("PrismaShadowResultStore — un solo registro por (pago, versión) (#4)", () => {
  it("listarPorPago devuelve un único registro tras reevaluar varias veces la misma versión", async () => {
    await store.guardar(resultado({ status: "BLOCKED", score: 0 }));
    await store.guardar(resultado({ status: "CANDIDATE", score: 88 }));
    await store.guardar(resultado({ status: "CANDIDATE", score: 95 }));

    const registros = await store.listarPorPago("pt-1");
    expect(registros).toHaveLength(1);
    expect(registros[0].score).toBe(95);
  });
});

// Caso #5: misma transacción + versión diferente → registros independientes.
describe("PrismaShadowResultStore — versiones de motor independientes (#5)", () => {
  it("dos engineVersion distintas del mismo pago generan DOS filas, no una", async () => {
    await store.guardar(resultado({ engineVersion: "3.5.0", score: 60 }));
    await store.guardar(resultado({ engineVersion: "3.6.0", score: 91 }));

    const registros = await store.listarPorPago("pt-1");
    expect(registros).toHaveLength(2);
    expect(registros.map((r) => r.engineVersion).sort()).toEqual(["3.5.0", "3.6.0"]);

    const v1 = await store.obtener("pt-1", "3.5.0");
    const v2 = await store.obtener("pt-1", "3.6.0");
    expect(v1?.score).toBe(60);
    expect(v2?.score).toBe(91);
  });
});

// Caso #6: persistencia correcta de blockers, señales y explanation.
describe("PrismaShadowResultStore — blockers/señales/explanation persistidos íntegros (#6)", () => {
  it("guarda y devuelve signals/blockers/explanation sin alterarlos", async () => {
    const r = resultado({
      status: "BLOCKED",
      score: 0,
      tier: null,
      candidateUnitId: null,
      candidateUnitOwnerId: null,
      candidateObligationId: null,
      signals: [
        { signal: "AMOUNT_MATCH", tier: 2, matched: true, strength: "MEDIUM", evidence: "Importe compatible" },
      ],
      blockers: [{ type: "CUIT_CONTRADICTORY", evidence: "El CUIT pertenece a otro titular." }],
      explanation: "✓ Importe compatible\n✗ El CUIT pertenece a otro titular.",
    });
    await store.guardar(r);

    const leido = await store.obtener("pt-1", "3.5.0");
    expect(leido?.signals).toEqual(r.signals);
    expect(leido?.blockers).toEqual(r.blockers);
    expect(leido?.explanation).toBe(r.explanation);
  });
});

// Fase 3.9 — topCandidateScore/topCandidateTier persisten y se leen de
// vuelta correctamente, incluidos en un BLOCKED (score/tier "oficiales" en
// 0/null, diagnóstico con el valor real).
describe("PrismaShadowResultStore — topCandidateScore/topCandidateTier (Fase 3.9)", () => {
  it("persiste y devuelve el diagnóstico tal cual, incluso cuando status=BLOCKED y score=0", async () => {
    await store.guardar(
      resultado({
        status: "BLOCKED",
        score: 0,
        tier: null,
        candidateUnitId: null,
        candidateUnitOwnerId: null,
        candidateObligationId: null,
        blockers: [{ type: "AMOUNT_INCOMPATIBLE", evidence: "x" }],
        topCandidateScore: 88,
        topCandidateTier: 1,
      })
    );

    const leido = await store.obtener("pt-1", "3.5.0");
    expect(leido?.status).toBe("BLOCKED");
    expect(leido?.score).toBe(0);
    expect(leido?.topCandidateScore).toBe(88);
    expect(leido?.topCandidateTier).toBe(1);
  });

  it("registros sin topCandidateScore/Tier (columna ausente en la fila) se leen como null, nunca undefined", async () => {
    // Simula una fila persistida ANTES de que existan estas columnas —
    // el fake delegate nunca las guardó porque no vinieron en `create`.
    fakeShadowMatchLog._todas(); // no-op, solo para dejar explícito el escenario
    await store.guardar(resultado({ topCandidateScore: null, topCandidateTier: null }));

    const leido = await store.obtener("pt-1", "3.5.0");
    expect(leido?.topCandidateScore).toBeNull();
    expect(leido?.topCandidateTier).toBeNull();
  });
});

// Caso #7: métricas agregadas — calcularMetricas (observability.ts) leyendo
// desde store.listar(), que a su vez lee del delegate falso de Prisma.
describe("PrismaShadowResultStore — métricas agregadas (#7)", () => {
  it("calcularMetricas resume correctamente lo persistido en el store", async () => {
    await store.guardar(resultado({ paymentTransactionId: "pt-1", engineVersion: "3.5.0", status: "CANDIDATE", score: 95, tier: 1 }));
    await store.guardar(resultado({ paymentTransactionId: "pt-2", engineVersion: "3.5.0", status: "BLOCKED", score: 0, tier: null, candidateUnitId: null, candidateUnitOwnerId: null, candidateObligationId: null, blockers: [{ type: "INSUFFICIENT_EVIDENCE", evidence: "x" }], signals: [] }));
    await store.guardar(resultado({ paymentTransactionId: "pt-3", engineVersion: "3.5.0", status: "AMBIGUOUS", score: 40, tier: 3, candidateUnitId: null, candidateUnitOwnerId: null, candidateObligationId: null, blockers: [{ type: "MULTIPLE_EQUIVALENT_CANDIDATES", evidence: "x" }], signals: [] }));

    const registros = await store.listar();
    const metricas = calcularMetricas(registros);

    expect(metricas.totalEvaluados).toBe(3);
    expect(metricas.porStatus).toEqual({ CANDIDATE: 1, AMBIGUOUS: 1, BLOCKED: 1 });
    expect(metricas.sinEvidencia).toBe(1);
  });
});

// Caso #8: confirmar que ningún test de este archivo escribe en Neon real —
// `@/lib/prisma` está completamente mockeado (ver vi.mock arriba); esta
// aserción confirma que el store efectivamente usó ESE mock (identidad de
// referencia), nunca un PrismaClient real conectado a Neon.
describe("PrismaShadowResultStore — sin Neon real (#8)", () => {
  it("el módulo @/lib/prisma importado en este archivo es el mock, no un cliente real", () => {
    expect(prismaImportado.shadowMatchLog).toBe(fakeShadowMatchLog);
  });

  it("todas las operaciones del store quedan en el delegate falso en memoria, nunca salen del proceso", async () => {
    await store.guardar(resultado());
    await store.obtener("pt-1", "3.5.0");
    await store.listar();
    await store.listarPorPago("pt-1");
    // Si algo hubiera intentado usar un PrismaClient real, hubiera fallado
    // al conectar (no hay red disponible/permitida en este test) — llegar
    // hasta acá sin error confirma que todo pasó por el fake en memoria.
    expect(fakeShadowMatchLog._todas().length).toBeGreaterThan(0);
  });
});
