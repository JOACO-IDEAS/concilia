import { describe, expect, it } from "vitest";
import type { CalibrationCase } from "./types";
import { calcularMetricasDeCalibracion, categorizarConfusion } from "./metrics";

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

describe("categorizarConfusion", () => {
  it("motor positivo + HUMAN_CONFIRMED → TP", () => {
    expect(categorizarConfusion(caso({ engineState: "PRE_CONCILIABLE", groundTruth: "HUMAN_CONFIRMED" }))).toBe("TP");
  });
  it("motor positivo + HUMAN_REJECTED → FP", () => {
    expect(categorizarConfusion(caso({ engineState: "PRE_CONCILIABLE", groundTruth: "HUMAN_REJECTED" }))).toBe("FP");
  });
  it("motor negativo + HUMAN_CONFIRMED → FN", () => {
    expect(categorizarConfusion(caso({ engineState: "NEEDS_DATA", groundTruth: "HUMAN_CONFIRMED" }))).toBe("FN");
  });
  it("motor negativo + HUMAN_REJECTED → TN", () => {
    expect(categorizarConfusion(caso({ engineState: "NEEDS_DATA", groundTruth: "HUMAN_REJECTED" }))).toBe("TN");
  });
  // Escenario #15: caso no vinculable nunca se fuerza a TP/TN/FP/FN.
  it.each(["UNRESOLVED", "INSUFFICIENT_DATA"] as const)("groundTruth=%s → NOT_CALIBRATABLE, nunca forzado", (gt) => {
    expect(categorizarConfusion(caso({ groundTruth: gt }))).toBe("NOT_CALIBRATABLE");
  });
});

describe("calcularMetricasDeCalibracion", () => {
  // Escenario #1: dataset vacío.
  it("dataset vacío → todos los conteos en cero, ninguna métrica confiable", () => {
    const m = calcularMetricasDeCalibracion([]);
    expect(m.totalCasos).toBe(0);
    expect(m.matrizDeConfusion).toEqual({ TP: 0, FP: 0, FN: 0, TN: 0, NOT_CALIBRATABLE: 0, total: 0 });
    expect(m.precisionAproximada).toEqual({ valor: null, muestra: 0, confiable: false });
  });

  // Escenario #11: métricas con muestra chica.
  it("muestra menor al umbral → confiable=false, pero el valor sigue calculado", () => {
    const casos = [caso({ groundTruth: "HUMAN_CONFIRMED", engineState: "PRE_CONCILIABLE" }), caso({ groundTruth: "HUMAN_REJECTED", engineState: "PRE_CONCILIABLE" })];
    const m = calcularMetricasDeCalibracion(casos, 5);
    expect(m.precisionAproximada.muestra).toBe(2); // TP=1, FP=1
    expect(m.precisionAproximada.confiable).toBe(false);
    expect(m.precisionAproximada.valor).toBe(0.5);
  });

  // Escenario #12: métricas con muestra suficiente.
  it("muestra igual o mayor al umbral → confiable=true", () => {
    const casos = Array.from({ length: 5 }, () => caso({ groundTruth: "HUMAN_CONFIRMED", engineState: "PRE_CONCILIABLE" }));
    const m = calcularMetricasDeCalibracion(casos, 5);
    expect(m.precisionAproximada.muestra).toBe(5);
    expect(m.precisionAproximada.confiable).toBe(true);
    expect(m.precisionAproximada.valor).toBe(1);
  });

  // Escenario #13: falso positivo real reflejado en la matriz.
  it("un caso FP se refleja en matrizDeConfusion.FP y en falsePositiveRate", () => {
    const casos = [caso({ groundTruth: "HUMAN_REJECTED", engineState: "PRE_CONCILIABLE" }), caso({ groundTruth: "HUMAN_REJECTED", engineState: "NEEDS_DATA" })];
    const m = calcularMetricasDeCalibracion(casos, 1);
    expect(m.matrizDeConfusion.FP).toBe(1);
    expect(m.matrizDeConfusion.TN).toBe(1);
    expect(m.falsePositiveRate.valor).toBe(0.5);
  });

  // Escenario #14: falso negativo real reflejado en la matriz.
  it("un caso FN se refleja en matrizDeConfusion.FN y en falseNegativeRate", () => {
    const casos = [caso({ groundTruth: "HUMAN_CONFIRMED", engineState: "NEEDS_DATA" }), caso({ groundTruth: "HUMAN_CONFIRMED", engineState: "PRE_CONCILIABLE" })];
    const m = calcularMetricasDeCalibracion(casos, 1);
    expect(m.matrizDeConfusion.FN).toBe(1);
    expect(m.matrizDeConfusion.TP).toBe(1);
    expect(m.falseNegativeRate.valor).toBe(0.5);
  });

  // Escenario #15: casos NOT_CALIBRATABLE cuentan aparte, nunca contaminan TP/FP/FN/TN.
  it("casos UNRESOLVED/INSUFFICIENT_DATA no entran en la matriz de confusión", () => {
    const casos = [caso({ groundTruth: "UNRESOLVED" }), caso({ groundTruth: "INSUFFICIENT_DATA" })];
    const m = calcularMetricasDeCalibracion(casos);
    expect(m.matrizDeConfusion.NOT_CALIBRATABLE).toBe(2);
    expect(m.matrizDeConfusion.TP + m.matrizDeConfusion.FP + m.matrizDeConfusion.FN + m.matrizDeConfusion.TN).toBe(0);
    expect(m.casosNoVinculables).toBe(1);
    expect(m.casosSinDecision).toBe(1);
  });

  it("distribución por estado/tier/score-bucket cuenta correctamente", () => {
    const casos = [caso({ engineState: "PRE_CONCILIABLE", tier: 1, engineScore: 85 }), caso({ engineState: "NEEDS_DATA", tier: null, engineScore: null })];
    const m = calcularMetricasDeCalibracion(casos);
    expect(m.distribucionPorEstado.find((d) => d.clave === "PRE_CONCILIABLE")?.cantidad).toBe(1);
    expect(m.distribucionPorTier.find((d) => d.clave === "sin-tier")?.cantidad).toBe(1);
    expect(m.distribucionPorScoreBucket.find((d) => d.clave === "80-99")?.cantidad).toBe(1);
    expect(m.distribucionPorScoreBucket.find((d) => d.clave === "sin-score")?.cantidad).toBe(1);
  });
});
