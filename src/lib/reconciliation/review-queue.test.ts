import { describe, expect, it } from "vitest";
import type { EvidenceFamilyResult } from "@/lib/payment-evidence/evidence-score";
import type { TopCandidateDiagnostico } from "./types";
import { esRevisable, filtrarCasosAmbiguos, filtrarCasosRevisables, type DecisionCruda, type EvaluacionCruda } from "./review-queue";

function familia(overrides: Partial<EvidenceFamilyResult> = {}): EvidenceFamilyResult {
  return { family: "BANK_MOVEMENT", nature: "POSITIVE", present: true, unitId: "unit-1", unitCode: "UF 2B", score: 85, tier: 1, detail: "", ...overrides };
}

function candidatoDiagnostico(overrides: Partial<TopCandidateDiagnostico> = {}): TopCandidateDiagnostico {
  return { unitCode: "2B", score: 40, tier: 3, matchedSignals: ["AMOUNT_MATCH"], ...overrides };
}

function evaluacion(overrides: Partial<EvaluacionCruda> = {}): EvaluacionCruda {
  return {
    id: "eval-1",
    paymentTransactionId: "pay-1",
    state: "PRE_CONCILIABLE",
    candidateUnitId: "unit-1",
    families: [familia()],
    hasContradiction: false,
    contradictionDetail: null,
    explanation: "Movimiento bancario identificado.",
    structuredEvidence: null,
    evaluatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("esRevisable", () => {
  it("PRE_CONCILIABLE con candidato y sin decisión previa → revisable", () => {
    expect(esRevisable(evaluacion(), [])).toBe(true);
  });

  it("RECONCILIATION_CONFIRMED con candidato → revisable", () => {
    expect(esRevisable(evaluacion({ state: "RECONCILIATION_CONFIRMED" }), [])).toBe(true);
  });

  it("NEEDS_DECISION por contradicción, con candidato puntual → revisable", () => {
    expect(esRevisable(evaluacion({ state: "NEEDS_DECISION", hasContradiction: true, contradictionDetail: "CUIT contradictorio" }), [])).toBe(true);
  });

  it("NEEDS_DATA nunca es revisable (falta evidencia, no criterio)", () => {
    expect(esRevisable(evaluacion({ state: "NEEDS_DATA", candidateUnitId: null }), [])).toBe(false);
  });

  it("INFORMATIONAL nunca es revisable", () => {
    expect(esRevisable(evaluacion({ state: "INFORMATIONAL" }), [])).toBe(false);
  });

  // Escenario #2 del pedido: caso sin candidato no aparece como revisable.
  it("sin candidateUnitId (ej. AMBIGUOUS) nunca es revisable, aunque el estado sea NEEDS_DECISION", () => {
    expect(esRevisable(evaluacion({ state: "NEEDS_DECISION", candidateUnitId: null }), [])).toBe(false);
  });

  it("ya decidido (APPROVED existente) → no revisable, nunca se vuelve a mostrar", () => {
    const decisiones: DecisionCruda[] = [{ paymentTransactionId: "pay-1", unitId: "unit-1", decision: "APPROVED" }];
    expect(esRevisable(evaluacion(), decisiones)).toBe(false);
  });

  it("ya decidido (REJECTED existente) → no revisable", () => {
    const decisiones: DecisionCruda[] = [{ paymentTransactionId: "pay-1", unitId: "unit-1", decision: "REJECTED" }];
    expect(esRevisable(evaluacion(), decisiones)).toBe(false);
  });

  it("decisión de OTRA unidad del mismo pago no bloquea la revisión de esta unidad", () => {
    const decisiones: DecisionCruda[] = [{ paymentTransactionId: "pay-1", unitId: "unit-OTRA", decision: "APPROVED" }];
    expect(esRevisable(evaluacion(), decisiones)).toBe(true);
  });

  it("decision=AUTO/SUGGESTED/EXCEPTION nunca cuenta como 'ya decidido' (nunca es AUTO)", () => {
    const decisiones: DecisionCruda[] = [{ paymentTransactionId: "pay-1", unitId: "unit-1", decision: "SUGGESTED" }];
    expect(esRevisable(evaluacion(), decisiones)).toBe(true);
  });
});

describe("filtrarCasosRevisables", () => {
  it("dataset vacío → cola vacía", () => {
    expect(filtrarCasosRevisables([], [])).toEqual([]);
  });

  it("muestra correctamente score/tier/evidencia del caso revisable", () => {
    const [caso] = filtrarCasosRevisables([evaluacion({ structuredEvidence: { bank: { signals: [], blockers: [], topCandidates: null }, whatsapp: null } })], []);
    expect(caso.score).toBe(85);
    expect(caso.tier).toBe(1);
    expect(caso.structuredEvidence?.bank?.blockers).toEqual([]);
  });

  it("toma solo la evaluación MÁS RECIENTE por pago", () => {
    const vieja = evaluacion({ id: "eval-vieja", evaluatedAt: "2026-01-01T00:00:00.000Z", families: [familia({ score: 50 })] });
    const nueva = evaluacion({ id: "eval-nueva", evaluatedAt: "2026-01-03T00:00:00.000Z", families: [familia({ score: 90 })] });
    const casos = filtrarCasosRevisables([vieja, nueva], []);
    expect(casos).toHaveLength(1);
    expect(casos[0].score).toBe(90);
  });

  it("un pago ya decidido no aparece, otro pago sin decidir sí", () => {
    const decidido = evaluacion({ paymentTransactionId: "pay-decidido" });
    const pendiente = evaluacion({ paymentTransactionId: "pay-pendiente" });
    const decisiones: DecisionCruda[] = [{ paymentTransactionId: "pay-decidido", unitId: "unit-1", decision: "APPROVED" }];
    const casos = filtrarCasosRevisables([decidido, pendiente], decisiones);
    expect(casos).toHaveLength(1);
    expect(casos[0].paymentTransactionId).toBe("pay-pendiente");
  });

  it("ordena más reciente primero", () => {
    const a = evaluacion({ paymentTransactionId: "pay-a", evaluatedAt: "2026-01-01T00:00:00.000Z" });
    const b = evaluacion({ paymentTransactionId: "pay-b", evaluatedAt: "2026-01-05T00:00:00.000Z" });
    const casos = filtrarCasosRevisables([a, b], []);
    expect(casos.map((c) => c.paymentTransactionId)).toEqual(["pay-b", "pay-a"]);
  });
});

// Fase 5.13 — casos NEEDS_DECISION por AMBIGÜEDAD (selector multi-candidato).
function evaluacionAmbigua(overrides: Partial<EvaluacionCruda> = {}): EvaluacionCruda {
  return evaluacion({
    state: "NEEDS_DECISION",
    candidateUnitId: null,
    families: [familia({ nature: "NEGATIVE", unitId: null })],
    hasContradiction: false,
    explanation: "Hay más de una unidad compatible. Falta evidencia que permita diferenciarlas.",
    structuredEvidence: { bank: { signals: [], blockers: [{ type: "MULTIPLE_EQUIVALENT_CANDIDATES", evidence: "2 candidatos." }], topCandidates: [candidatoDiagnostico({ unitCode: "2B", score: 40 }), candidatoDiagnostico({ unitCode: "3A", score: 38 })] }, whatsapp: null },
    ...overrides,
  });
}

describe("filtrarCasosAmbiguos", () => {
  it("dataset vacío → sin casos ambiguos", () => {
    expect(filtrarCasosAmbiguos([], [])).toEqual([]);
  });

  it("un caso NEEDS_DECISION sin candidateUnitId y con 2+ topCandidates es ambiguo", () => {
    const casos = filtrarCasosAmbiguos([evaluacionAmbigua()], []);
    expect(casos).toHaveLength(1);
    expect(casos[0].candidatos).toHaveLength(2);
    expect(casos[0].candidatos.map((c) => c.unitCode)).toEqual(["2B", "3A"]);
  });

  it("NEEDS_DECISION por CONTRADICCIÓN (candidateUnitId presente) nunca es ambiguo — ese es el otro camino (CasoRevisable)", () => {
    const contradictorio = evaluacion({ state: "NEEDS_DECISION", hasContradiction: true, candidateUnitId: "unit-1" });
    expect(filtrarCasosAmbiguos([contradictorio], [])).toEqual([]);
  });

  it("con menos de 2 topCandidates, no hay entre qué elegir — no es ambiguo", () => {
    const unSoloCandidato = evaluacionAmbigua({ structuredEvidence: { bank: { signals: [], blockers: [], topCandidates: [candidatoDiagnostico()] }, whatsapp: null } });
    expect(filtrarCasosAmbiguos([unSoloCandidato], [])).toEqual([]);
  });

  it("sin structuredEvidence, no hay dato de candidatos → no es ambiguo (nunca se inventa)", () => {
    const sinEvidencia = evaluacionAmbigua({ structuredEvidence: null });
    expect(filtrarCasosAmbiguos([sinEvidencia], [])).toEqual([]);
  });

  it("PRE_CONCILIABLE/RECONCILIATION_CONFIRMED nunca son ambiguos", () => {
    expect(filtrarCasosAmbiguos([evaluacion({ state: "PRE_CONCILIABLE" })], [])).toEqual([]);
    expect(filtrarCasosAmbiguos([evaluacion({ state: "RECONCILIATION_CONFIRMED" })], [])).toEqual([]);
  });

  it("una decisión ya tomada sobre CUALQUIER unidad de este pago cierra el caso ambiguo", () => {
    const decisiones: DecisionCruda[] = [{ paymentTransactionId: "pay-1", unitId: "unit-2B", decision: "APPROVED" }];
    expect(filtrarCasosAmbiguos([evaluacionAmbigua()], decisiones)).toEqual([]);
  });

  it("un REJECTED sobre cualquier unidad de este pago también lo cierra", () => {
    const decisiones: DecisionCruda[] = [{ paymentTransactionId: "pay-1", unitId: "unit-3A", decision: "REJECTED" }];
    expect(filtrarCasosAmbiguos([evaluacionAmbigua()], decisiones)).toEqual([]);
  });

  it("decision=SUGGESTED/AUTO/EXCEPTION nunca cierra el caso (nunca es AUTO)", () => {
    const decisiones: DecisionCruda[] = [{ paymentTransactionId: "pay-1", unitId: "unit-2B", decision: "SUGGESTED" }];
    expect(filtrarCasosAmbiguos([evaluacionAmbigua()], decisiones)).toHaveLength(1);
  });

  it("toma la evaluación más reciente por pago, igual que filtrarCasosRevisables", () => {
    const vieja = evaluacionAmbigua({ id: "eval-vieja", evaluatedAt: "2026-01-01T00:00:00.000Z" });
    const nueva = evaluacionAmbigua({
      id: "eval-nueva",
      evaluatedAt: "2026-01-03T00:00:00.000Z",
      structuredEvidence: { bank: { signals: [], blockers: [], topCandidates: [candidatoDiagnostico({ unitCode: "4A" }), candidatoDiagnostico({ unitCode: "5B" })] }, whatsapp: null },
    });
    const casos = filtrarCasosAmbiguos([vieja, nueva], []);
    expect(casos).toHaveLength(1);
    expect(casos[0].candidatos.map((c) => c.unitCode)).toEqual(["4A", "5B"]);
  });

  it("nunca mezcla un caso ambiguo dentro de filtrarCasosRevisables ni viceversa", () => {
    const ambiguo = evaluacionAmbigua();
    expect(filtrarCasosRevisables([ambiguo], [])).toEqual([]);
    const revisable = evaluacion();
    expect(filtrarCasosAmbiguos([revisable], [])).toEqual([]);
  });
});
