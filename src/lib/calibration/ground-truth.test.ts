import { describe, expect, it } from "vitest";
import { vincularEvaluacionConDecision, type DecisionCruda, type EvaluacionCruda } from "./ground-truth";

function evaluacion(overrides: Partial<EvaluacionCruda> = {}): EvaluacionCruda {
  return { id: "eval-1", paymentTransactionId: "pay-1", candidateUnitId: "unit-1", evaluatedAt: "2026-01-01T00:00:00.000Z", ...overrides };
}
function decision(overrides: Partial<DecisionCruda> = {}): DecisionCruda {
  return { id: "dec-1", paymentTransactionId: "pay-1", unitId: "unit-1", decision: "APPROVED", createdAt: "2026-01-02T00:00:00.000Z", ...overrides };
}

describe("vincularEvaluacionConDecision", () => {
  // Escenario #6 del pedido: pago sin ninguna decisión humana todavía.
  it("sin decisiones del pago → INSUFFICIENT_DATA", () => {
    const r = vincularEvaluacionConDecision(evaluacion(), [evaluacion()], []);
    expect(r).toEqual({ groundTruth: "INSUFFICIENT_DATA", humanDecision: null, humanDecidedAt: null, humanDecisionSourceId: null, humanConfirmedUnitId: null });
  });

  // Escenario #7 del pedido: caso ambiguo — evaluación sin candidato propuesto.
  it("candidateUnitId null en la evaluación → UNRESOLVED aunque haya decisiones", () => {
    const e = evaluacion({ candidateUnitId: null });
    const r = vincularEvaluacionConDecision(e, [e], [decision()]);
    expect(r.groundTruth).toBe("UNRESOLVED");
    expect(r.humanDecision).toBeNull();
  });

  it("decisión con unitId distinto del candidateUnitId propuesto → UNRESOLVED", () => {
    const e = evaluacion({ candidateUnitId: "unit-1" });
    const d = decision({ unitId: "unit-OTRA" });
    const r = vincularEvaluacionConDecision(e, [e], [d]);
    expect(r.groundTruth).toBe("UNRESOLVED");
  });

  // Escenario #3: motor positivo (candidato propuesto) + humano APPROVED.
  it("decisión APPROVED vinculada por unidad y causalidad → HUMAN_CONFIRMED", () => {
    const e = evaluacion({ evaluatedAt: "2026-01-01T00:00:00.000Z" });
    const d = decision({ decision: "APPROVED", createdAt: "2026-01-02T00:00:00.000Z" });
    const r = vincularEvaluacionConDecision(e, [e], [d]);
    expect(r).toEqual({ groundTruth: "HUMAN_CONFIRMED", humanDecision: "APPROVED", humanDecidedAt: d.createdAt, humanDecisionSourceId: d.id, humanConfirmedUnitId: "unit-1" });
  });

  // Escenario #4: motor positivo + humano REJECTED (falso positivo).
  it("decisión REJECTED vinculada → HUMAN_REJECTED", () => {
    const e = evaluacion();
    const d = decision({ decision: "REJECTED" });
    const r = vincularEvaluacionConDecision(e, [e], [d]);
    expect(r.groundTruth).toBe("HUMAN_REJECTED");
    expect(r.humanDecision).toBe("REJECTED");
  });

  // Escenario #18 (AUTO imposible como ground truth): decisiones que no son
  // APPROVED/REJECTED nunca cuentan como decisión humana real.
  it.each(["AUTO", "SUGGESTED", "EXCEPTION"])("decision=%s nunca es ground truth humano (queda INSUFFICIENT_DATA si es la única)", (tipo) => {
    const e = evaluacion();
    const d = decision({ decision: tipo });
    const r = vincularEvaluacionConDecision(e, [e], [d]);
    expect(r.groundTruth).toBe("INSUFFICIENT_DATA");
    expect(r.humanDecision).toBeNull();
  });

  // Escenario #9: múltiples evaluaciones del mismo pago — causalidad.
  it("con dos evaluaciones de la misma unidad, la decisión se vincula a la MÁS RECIENTE anterior o igual a la decisión", () => {
    const eVieja = evaluacion({ id: "eval-vieja", evaluatedAt: "2026-01-01T00:00:00.000Z" });
    const eNueva = evaluacion({ id: "eval-nueva", evaluatedAt: "2026-01-03T00:00:00.000Z" });
    const d = decision({ createdAt: "2026-01-04T00:00:00.000Z" });
    const todas = [eVieja, eNueva];

    const resultadoVieja = vincularEvaluacionConDecision(eVieja, todas, [d]);
    const resultadoNueva = vincularEvaluacionConDecision(eNueva, todas, [d]);

    expect(resultadoVieja.groundTruth).toBe("UNRESOLVED"); // superada por eNueva
    expect(resultadoNueva.groundTruth).toBe("HUMAN_CONFIRMED");
    expect(resultadoNueva.humanDecisionSourceId).toBe(d.id);
  });

  it("decisión anterior a cualquier evidencia con esa unidad (causalidad rota) → UNRESOLVED", () => {
    const e = evaluacion({ evaluatedAt: "2026-01-05T00:00:00.000Z" });
    const d = decision({ createdAt: "2026-01-01T00:00:00.000Z" }); // la decisión es ANTES de la evidencia
    const r = vincularEvaluacionConDecision(e, [e], [d]);
    expect(r.groundTruth).toBe("UNRESOLVED");
  });

  // Escenario #7 adicional: evaluación sin decisiones compatibles pero el
  // pago sí tiene decisiones (de otra unidad) → nunca se fuerza el vínculo.
  it("hay decisiones del pago pero ninguna compatible con esta unidad → UNRESOLVED, nunca INSUFFICIENT_DATA", () => {
    const e = evaluacion({ candidateUnitId: "unit-1" });
    const d = decision({ unitId: "unit-2", decision: "APPROVED" });
    const r = vincularEvaluacionConDecision(e, [e], [d]);
    expect(r.groundTruth).toBe("UNRESOLVED");
  });
});

// Fase 5.13 — cierre del loop selección-multicandidato: una evaluación
// AMBIGUA (candidateUnitId=null) con `candidatosPosiblesUnitIds` reales
// puede vincularse a una decisión sobre cualquiera de esos candidatos —
// nunca inventando candidateUnitId, nunca mutando la evaluación.
function evaluacionAmbigua(overrides: Partial<EvaluacionCruda> = {}): EvaluacionCruda {
  return { id: "eval-ambiguo", paymentTransactionId: "pay-1", candidateUnitId: null, candidatosPosiblesUnitIds: ["unit-1A", "unit-2B", "unit-2A"], evaluatedAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

describe("vincularEvaluacionConDecision — casos AMBIGUOS (Fase 5.13)", () => {
  // Escenario A del pedido: AMBIGUOUS + humano elige UF 1A → HUMAN_CONFIRMED + candidateUnitId=UF 1A (vía humanConfirmedUnitId).
  it("APPROVED sobre uno de los candidatos reales de una evaluación ambigua → HUMAN_CONFIRMED, humanConfirmedUnitId = ese candidato", () => {
    const e = evaluacionAmbigua();
    const d = decision({ id: "dec-1a", unitId: "unit-1A", decision: "APPROVED", createdAt: "2026-01-02T00:00:00.000Z" });
    const r = vincularEvaluacionConDecision(e, [e], [d]);
    expect(r.groundTruth).toBe("HUMAN_CONFIRMED");
    expect(r.humanConfirmedUnitId).toBe("unit-1A");
    expect(r.humanDecisionSourceId).toBe("dec-1a");
  });

  // Escenario B: elegir OTRO candidato del mismo conjunto queda igual de bien vinculado.
  it("APPROVED sobre OTRO candidato del mismo conjunto ambiguo (2B en vez de 1A) → vinculado a 2B, no a 1A", () => {
    const e = evaluacionAmbigua();
    const d = decision({ id: "dec-2b", unitId: "unit-2B", decision: "APPROVED", createdAt: "2026-01-02T00:00:00.000Z" });
    const r = vincularEvaluacionConDecision(e, [e], [d]);
    expect(r.groundTruth).toBe("HUMAN_CONFIRMED");
    expect(r.humanConfirmedUnitId).toBe("unit-2B");
  });

  // Escenario C: "ninguno es correcto" — REJECTED sobre un candidato del conjunto → HUMAN_REJECTED, sin unidad confirmada.
  it("REJECTED sobre un candidato del conjunto ambiguo → HUMAN_REJECTED, humanConfirmedUnitId=null", () => {
    const e = evaluacionAmbigua();
    const d = decision({ id: "dec-rej", unitId: "unit-2A", decision: "REJECTED", createdAt: "2026-01-02T00:00:00.000Z" });
    const r = vincularEvaluacionConDecision(e, [e], [d]);
    expect(r.groundTruth).toBe("HUMAN_REJECTED");
    expect(r.humanConfirmedUnitId).toBeNull();
  });

  it("rechazo de TODOS los candidatos (una REJECTED por cada uno, mismo patrón de escritura real) → HUMAN_REJECTED", () => {
    const e = evaluacionAmbigua();
    const decisiones = [
      decision({ id: "dec-1", unitId: "unit-1A", decision: "REJECTED", createdAt: "2026-01-02T00:00:00.000Z" }),
      decision({ id: "dec-2", unitId: "unit-2B", decision: "REJECTED", createdAt: "2026-01-02T00:00:01.000Z" }),
      decision({ id: "dec-3", unitId: "unit-2A", decision: "REJECTED", createdAt: "2026-01-02T00:00:02.000Z" }),
    ];
    const r = vincularEvaluacionConDecision(e, [e], decisiones);
    expect(r.groundTruth).toBe("HUMAN_REJECTED");
    expect(r.humanConfirmedUnitId).toBeNull();
  });

  it("una decisión sobre una unidad que NO está entre los candidatos ambiguos reales → UNRESOLVED, nunca se fuerza", () => {
    const e = evaluacionAmbigua();
    const d = decision({ unitId: "unit-9Z-no-es-candidato", decision: "APPROVED" });
    const r = vincularEvaluacionConDecision(e, [e], [d]);
    expect(r.groundTruth).toBe("UNRESOLVED");
  });

  // Escenario G: sin ninguna decisión, sigue INSUFFICIENT_DATA (nunca UNRESOLVED por descarte).
  it("evaluación ambigua sin ninguna decisión del pago → INSUFFICIENT_DATA", () => {
    const e = evaluacionAmbigua();
    const r = vincularEvaluacionConDecision(e, [e], []);
    expect(r.groundTruth).toBe("INSUFFICIENT_DATA");
  });

  it("candidatosPosiblesUnitIds ausente/vacío en una evaluación sin candidateUnitId → UNRESOLVED, mismo comportamiento que antes de Fase 5.13", () => {
    const e = evaluacionAmbigua({ candidatosPosiblesUnitIds: null });
    const d = decision({ unitId: "unit-1A", decision: "APPROVED" });
    expect(vincularEvaluacionConDecision(e, [e], [d]).groundTruth).toBe("UNRESOLVED");

    const eVacio = evaluacionAmbigua({ candidatosPosiblesUnitIds: [] });
    expect(vincularEvaluacionConDecision(eVacio, [eVacio], [d]).groundTruth).toBe("UNRESOLVED");
  });

  it("causalidad: una evaluación ambigua MÁS RECIENTE con el mismo candidato gana sobre una vieja", () => {
    const vieja = evaluacionAmbigua({ id: "eval-vieja", evaluatedAt: "2026-01-01T00:00:00.000Z" });
    const nueva = evaluacionAmbigua({ id: "eval-nueva", evaluatedAt: "2026-01-03T00:00:00.000Z" });
    const d = decision({ unitId: "unit-1A", decision: "APPROVED", createdAt: "2026-01-04T00:00:00.000Z" });
    const todas = [vieja, nueva];
    expect(vincularEvaluacionConDecision(vieja, todas, [d]).groundTruth).toBe("UNRESOLVED");
    expect(vincularEvaluacionConDecision(nueva, todas, [d]).groundTruth).toBe("HUMAN_CONFIRMED");
  });
});
