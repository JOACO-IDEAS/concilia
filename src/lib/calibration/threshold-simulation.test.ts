import { describe, expect, it } from "vitest";
import type { TopCandidateDiagnostico } from "@/lib/reconciliation/types";
import type { CalibrationCase } from "./types";
import { MARGEN_AMBIGUEDAD_ACTUAL, simularMargenAmbiguedad, simularPesosPorTier, simularUmbralesDeScore } from "./threshold-simulation";

function candidato(overrides: Partial<TopCandidateDiagnostico> = {}): TopCandidateDiagnostico {
  return { unitCode: "UF 2B", score: 85, tier: 1, matchedSignals: ["CUIT_EXACT"], ...overrides };
}

function caso(overrides: Partial<CalibrationCase> = {}): CalibrationCase {
  return {
    paymentTransactionId: "pay-1",
    candidateUnitId: "unit-1",
    bankEngineVersion: "3.9.0",
    evidenceScoreVersion: "5.7.0",
    engineState: "PRE_CONCILIABLE",
    engineScore: 85,
    tier: 1,
    families: [],
    independentFamiliesConverging: ["BANK_MOVEMENT"],
    structuredEvidence: null,
    hasContradiction: false,
    contradictionDetail: null,
    explanation: "",
    evaluatedAt: "2026-01-01T00:00:00.000Z",
    groundTruth: "HUMAN_CONFIRMED",
    humanDecision: "APPROVED",
    humanDecidedAt: "2026-01-02T00:00:00.000Z",
    humanDecisionSourceId: "dec-1",
    humanDecisionProvenance: "ORGANIC",
    humanRejectionReason: null,
    humanConfirmedUnitId: null,
    humanDecidedBy: null,
    humanDecisionScore: null,
    origin: "REAL",
    ...overrides,
  };
}

describe("simularUmbralesDeScore", () => {
  // Escenario #16: simulación de threshold.
  it("un umbral más alto que el score real convierte un TP real en FN simulado", () => {
    const [resultado] = simularUmbralesDeScore([caso({ engineScore: 62, groundTruth: "HUMAN_CONFIRMED" })], [80]);
    expect(resultado.matrizSimulada).toEqual({ TP: 0, FP: 0, FN: 1, TN: 0, total: 1 });
    expect(resultado.cambiosDeCategoria).toEqual([{ paymentTransactionId: "pay-1", categoriaReal: "TP", categoriaSimulada: "FN" }]);
  });

  it("un umbral más bajo que el score real no cambia nada respecto al estado real", () => {
    const [resultado] = simularUmbralesDeScore([caso({ engineScore: 85, engineState: "PRE_CONCILIABLE", groundTruth: "HUMAN_CONFIRMED" })], [50]);
    expect(resultado.matrizSimulada.TP).toBe(1);
    expect(resultado.cambiosDeCategoria).toEqual([]);
  });

  it("casos sin engineScore quedan fuera de la simulación (nunca se inventa un score)", () => {
    const [resultado] = simularUmbralesDeScore([caso({ engineScore: null, groundTruth: "HUMAN_CONFIRMED" })], [80]);
    expect(resultado.casosEvaluables).toBe(0);
  });

  it("casos UNRESOLVED/INSUFFICIENT_DATA quedan fuera (no son evaluables)", () => {
    const [resultado] = simularUmbralesDeScore([caso({ groundTruth: "UNRESOLVED" }), caso({ groundTruth: "INSUFFICIENT_DATA" })], [80]);
    expect(resultado.casosEvaluables).toBe(0);
  });

  it("dataset vacío → un resultado por umbral, todo en cero", () => {
    const resultados = simularUmbralesDeScore([], [80, 85, 90]);
    expect(resultados).toHaveLength(3);
    expect(resultados.every((r) => r.casosEvaluables === 0)).toBe(true);
  });
});

describe("simularMargenAmbiguedad", () => {
  it("MARGEN_AMBIGUEDAD_ACTUAL coincide con el valor real de deterministic-matcher.ts (10)", () => {
    expect(MARGEN_AMBIGUEDAD_ACTUAL).toBe(10);
  });

  // Escenario #16: simulación de margen — caso hoy no ambiguo (diferencia=15) pasa a serlo con margen=20.
  it("un margen más laxo que la diferencia real vuelve ambiguo un caso hoy no-ambiguo", () => {
    const c = caso({
      structuredEvidence: { bank: { signals: [], blockers: [], topCandidates: [candidato({ score: 90 }), candidato({ score: 75, unitCode: "UF 3A" })] }, whatsapp: null },
    });
    const [resultado] = simularMargenAmbiguedad([c], [20]);
    expect(resultado.casosAplicables).toBe(1);
    expect(resultado.detalle[0].diferenciaTopDos).toBe(15);
    expect(resultado.detalle[0].esAmbiguoHoy).toBe(false);
    expect(resultado.detalle[0].esAmbiguoSimulado).toBe(true);
    expect(resultado.casosQuePasanASerAmbiguos).toBe(1);
    expect(resultado.casosQueDejanDeSerAmbiguos).toBe(0);
  });

  it("un margen más estricto saca de la ambigüedad un caso hoy ambiguo", () => {
    const c = caso({
      structuredEvidence: { bank: { signals: [], blockers: [], topCandidates: [candidato({ score: 90 }), candidato({ score: 85, unitCode: "UF 3A" })] }, whatsapp: null },
    });
    const [resultado] = simularMargenAmbiguedad([c], [3]);
    expect(resultado.detalle[0].diferenciaTopDos).toBe(5);
    expect(resultado.detalle[0].esAmbiguoHoy).toBe(true); // 5 <= 10
    expect(resultado.detalle[0].esAmbiguoSimulado).toBe(false); // 5 > 3
    expect(resultado.casosQueDejanDeSerAmbiguos).toBe(1);
  });

  it("casos sin al menos 2 topCandidates quedan fuera de la simulación (nunca se inventa un ranking)", () => {
    const c = caso({ structuredEvidence: { bank: { signals: [], blockers: [], topCandidates: [candidato()] }, whatsapp: null } });
    const [resultado] = simularMargenAmbiguedad([c], [20]);
    expect(resultado.casosAplicables).toBe(0);
  });

  it("dataset vacío → sin casos aplicables para ningún margen", () => {
    const resultados = simularMargenAmbiguedad([], [5, 10, 20]);
    expect(resultados.every((r) => r.casosAplicables === 0)).toBe(true);
  });
});

describe("simularPesosPorTier", () => {
  it("recalcula el score real con la MISMA fórmula (suma capada en 99) usando pesos alternativos", () => {
    const c = caso({
      engineScore: 62, // 40 (tier1) + 22 (tier2), pesos reales
      structuredEvidence: {
        bank: { signals: [{ signal: "CUIT_EXACT", tier: 1, matched: true, strength: "STRONG", evidence: "" }, { signal: "AMOUNT_MATCH", tier: 2, matched: true, strength: "STRONG", evidence: "" }], blockers: [], topCandidates: null },
        whatsapp: null,
      },
    });
    const resultado = simularPesosPorTier([c], { 1: 50, 2: 30, 3: 12, 4: 5 });
    expect(resultado.casosEvaluables).toBe(1);
    expect(resultado.cambios[0]).toEqual({ paymentTransactionId: "pay-1", scoreActual: 62, scoreSimulado: 80, diferencia: 18 });
  });

  it("el score simulado nunca supera 99 (misma regla real Math.min(99, ...))", () => {
    const c = caso({
      structuredEvidence: {
        bank: { signals: [{ signal: "CUIT_EXACT", tier: 1, matched: true, strength: "STRONG", evidence: "" }, { signal: "AMOUNT_MATCH", tier: 1, matched: true, strength: "STRONG", evidence: "" }], blockers: [], topCandidates: null },
        whatsapp: null,
      },
    });
    const resultado = simularPesosPorTier([c], { 1: 90, 2: 22, 3: 12, 4: 5 });
    expect(resultado.cambios[0].scoreSimulado).toBe(99);
  });

  it("casos sin structuredEvidence.bank.signals quedan fuera (nunca inventa señales)", () => {
    const resultado = simularPesosPorTier([caso({ structuredEvidence: null })], { 1: 40, 2: 22, 3: 12, 4: 5 });
    expect(resultado.casosEvaluables).toBe(0);
    expect(resultado.cambios).toEqual([]);
  });

  it("casos UNRESOLVED/INSUFFICIENT_DATA quedan fuera", () => {
    const c = caso({ groundTruth: "UNRESOLVED", structuredEvidence: { bank: { signals: [{ signal: "CUIT_EXACT", tier: 1, matched: true, strength: "STRONG", evidence: "" }], blockers: [], topCandidates: null }, whatsapp: null } });
    const resultado = simularPesosPorTier([c], { 1: 40, 2: 22, 3: 12, 4: 5 });
    expect(resultado.casosEvaluables).toBe(0);
  });

  it("dataset vacío → sin casos evaluables", () => {
    const resultado = simularPesosPorTier([], { 1: 40, 2: 22, 3: 12, 4: 5 });
    expect(resultado.casosEvaluables).toBe(0);
    expect(resultado.cambios).toEqual([]);
  });

  it("pesos idénticos a los reales → diferencia 0 (control de sanidad)", () => {
    const c = caso({
      engineScore: 40,
      structuredEvidence: { bank: { signals: [{ signal: "CUIT_EXACT", tier: 1, matched: true, strength: "STRONG", evidence: "" }], blockers: [], topCandidates: null }, whatsapp: null },
    });
    const resultado = simularPesosPorTier([c]); // usa PUNTOS_POR_TIER_ACTUAL por default
    expect(resultado.cambios[0].diferencia).toBe(0);
  });
});
