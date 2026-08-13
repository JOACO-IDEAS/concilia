import { describe, expect, it } from "vitest";
import type { TopCandidateDiagnostico } from "@/lib/reconciliation/types";
import type { CalibrationCase, DecisionProvenance } from "./types";
import {
  calcularNivelDeConfianza,
  compararConfiguraciones,
  generarRecomendacionesDeCalibracion,
  generarRecomendacionesDeMargenAmbiguedad,
  generarRecomendacionesDePatrones,
  generarRecomendacionesDeUmbralDeScore,
  generarRecomendacionDePesosPorTier,
} from "./recommendation";

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
    structuredEvidence: {
      bank: { signals: [{ signal: "CUIT_EXACT", tier: 1, matched: true, strength: "STRONG", evidence: "" }], blockers: [], topCandidates: [candidato({ score: 90 }), candidato({ score: 70, unitCode: "UF 3A" })] },
      whatsapp: null,
    },
    hasContradiction: false,
    contradictionDetail: null,
    explanation: "",
    evaluatedAt: "2026-01-01T00:00:00.000Z",
    groundTruth: "HUMAN_CONFIRMED",
    humanDecision: "APPROVED",
    humanDecidedAt: "2026-01-02T00:00:00.000Z",
    humanDecisionSourceId: "dec-1",
    humanDecisionProvenance: "SYNTHETIC_DEMO",
    humanRejectionReason: null,
    humanConfirmedUnitId: null,
    humanDecidedBy: null,
    humanDecisionScore: null,
    origin: "REAL",
    ...overrides,
  };
}

describe("calcularNivelDeConfianza", () => {
  it("0 casos ORGANIC → insuficiente, sin importar cuántos SYNTHETIC_DEMO haya", () => {
    expect(calcularNivelDeConfianza(0, 5)).toBe("insuficiente");
  });
  it("menos que el umbral → baja", () => {
    expect(calcularNivelDeConfianza(3, 5)).toBe("baja");
  });
  it("entre 1x y 2x el umbral → media", () => {
    expect(calcularNivelDeConfianza(7, 5)).toBe("media");
  });
  it(">= 2x el umbral → alta", () => {
    expect(calcularNivelDeConfianza(10, 5)).toBe("alta");
  });
});

describe("generarRecomendacionesDePatrones", () => {
  it("dataset vacío → sin recomendaciones de patrón con casos", () => {
    const recos = generarRecomendacionesDePatrones([]);
    expect(recos.every((r) => r.patron.totalCasos === 0)).toBe(true);
  });

  // Regla 3: con la única muestra existente hoy siendo SYNTHETIC_DEMO, la confianza debe ser "insuficiente".
  it("con muestra 100% SYNTHETIC_DEMO, nivelDeConfianza es 'insuficiente' aunque totalCasos > 0", () => {
    const casos = Array.from({ length: 10 }, (_, i) => caso({ paymentTransactionId: `pay-${i}`, humanDecisionProvenance: "SYNTHETIC_DEMO" }));
    const recos = generarRecomendacionesDePatrones(casos, 5);
    const patronCuit = recos.find((r) => r.patron.tipo === "SIGNAL_COMBINATION" && r.patron.firma.includes("CUIT_EXACT"));
    expect(patronCuit?.patron.totalCasos).toBe(10);
    expect(patronCuit?.nivelDeConfianza).toBe("insuficiente");
    expect(patronCuit?.descripcionAuditable).toContain("0 caso(s) ORGANIC");
    expect(patronCuit?.descripcionAuditable).toContain("insuficiente");
  });

  it("con muestra ORGANIC suficiente, sube el nivel de confianza", () => {
    const casos = Array.from({ length: 10 }, (_, i) => caso({ paymentTransactionId: `pay-${i}`, humanDecisionProvenance: "ORGANIC" as DecisionProvenance }));
    const recos = generarRecomendacionesDePatrones(casos, 5);
    const patronCuit = recos.find((r) => r.patron.tipo === "SIGNAL_COMBINATION" && r.patron.firma.includes("CUIT_EXACT"));
    expect(patronCuit?.nivelDeConfianza).toBe("alta");
    expect(patronCuit?.descripcionAuditable).toContain("En 10 caso(s) ORGANIC");
  });

  it("caso mixto ORGANIC+SYNTHETIC_DEMO: la descripción etiqueta ambos por separado", () => {
    const casos = [
      ...Array.from({ length: 6 }, (_, i) => caso({ paymentTransactionId: `org-${i}`, humanDecisionProvenance: "ORGANIC" as DecisionProvenance })),
      ...Array.from({ length: 3 }, (_, i) => caso({ paymentTransactionId: `synth-${i}`, humanDecisionProvenance: "SYNTHETIC_DEMO" as DecisionProvenance })),
    ];
    const recos = generarRecomendacionesDePatrones(casos, 5);
    const patronCuit = recos.find((r) => r.patron.tipo === "SIGNAL_COMBINATION" && r.patron.firma.includes("CUIT_EXACT"));
    expect(patronCuit?.patron.origenDeMuestra).toEqual({ organic: 6, syntheticDemo: 3 });
    expect(patronCuit?.descripcionAuditable).toContain("6 caso(s) ORGANIC");
    expect(patronCuit?.descripcionAuditable).toContain("3 caso(s) SYNTHETIC_DEMO");
    expect(patronCuit?.nivelDeConfianza).toBe("media"); // 6 organic: >= umbral(5) pero < 2*umbral(10)
  });
});

describe("generarRecomendacionesDeUmbralDeScore", () => {
  it("reporta matrizAntes real y regresión/mejora correctamente clasificada", () => {
    const casoQueMejora = caso({ paymentTransactionId: "pay-fp", groundTruth: "HUMAN_REJECTED", humanDecision: "REJECTED", engineScore: 40, engineState: "PRE_CONCILIABLE" }); // FP real
    const [reco] = generarRecomendacionesDeUmbralDeScore([casoQueMejora], [80]);
    expect(reco.matrizAntes).toEqual({ TP: 0, FP: 1, FN: 0, TN: 0, total: 1 });
    // score=40 < umbral=80 → motor simulado negativo → HUMAN_REJECTED + negativo = TN → FP a TN es una MEJORA.
    expect(reco.mejoras).toEqual(["pay-fp"]);
    expect(reco.regresiones).toEqual([]);
    expect(reco.variacionPorcentualFP).toBe(-100);
  });

  it("origenDeMuestra y nivelDeConfianza reflejan la procedencia real de los casos evaluables", () => {
    const casos = Array.from({ length: 6 }, (_, i) => caso({ paymentTransactionId: `pay-${i}`, humanDecisionProvenance: "ORGANIC" as DecisionProvenance }));
    const [reco] = generarRecomendacionesDeUmbralDeScore(casos, [50], 5);
    expect(reco.origenDeMuestra).toEqual({ organic: 6, syntheticDemo: 0 });
    expect(reco.nivelDeConfianza).toBe("media");
  });

  it("valorActual siempre null (no existe un corte numérico real en evidence-score.ts)", () => {
    const [reco] = generarRecomendacionesDeUmbralDeScore([caso()], [80]);
    expect(reco.valorActual).toBeNull();
  });
});

describe("generarRecomendacionesDeMargenAmbiguedad", () => {
  it("valorActual coincide con MARGEN_AMBIGUEDAD_ACTUAL real (10)", () => {
    const [reco] = generarRecomendacionesDeMargenAmbiguedad([caso()], [20]);
    expect(reco.valorActual).toBe(10);
    expect(reco.valorPropuesto).toBe(20);
  });

  it("dataset vacío → sin casos aplicables, confianza insuficiente", () => {
    const [reco] = generarRecomendacionesDeMargenAmbiguedad([], [20]);
    expect(reco.origenDeMuestra).toEqual({ organic: 0, syntheticDemo: 0 });
    expect(reco.nivelDeConfianza).toBe("insuficiente");
  });
});

describe("generarRecomendacionDePesosPorTier", () => {
  it("incluye la limitación estructural explícita (no produce TP/FP/FN)", () => {
    const reco = generarRecomendacionDePesosPorTier([caso()], { 1: 50, 2: 22, 3: 12, 4: 5 });
    expect(reco.limitacion).toContain("no produce una matriz TP/FP/FN/TN".slice(0, 10)); // substring parcial robusto a redacción
    expect(reco.valorActual).toEqual({ 1: 40, 2: 22, 3: 12, 4: 5 });
    expect(reco.resultado.cambios[0].scoreSimulado).toBe(50);
  });
});

describe("generarRecomendacionesDeCalibracion (bundle)", () => {
  it("dataset vacío → estructura completa, todo en insuficiente/cero, nunca lanza", () => {
    const recos = generarRecomendacionesDeCalibracion([]);
    expect(recos.patrones.every((p) => p.nivelDeConfianza === "insuficiente")).toBe(true);
    expect(recos.umbralesDeScore.every((u) => u.nivelDeConfianza === "insuficiente")).toBe(true);
    expect(recos.margenesDeAmbiguedad.every((m) => m.nivelDeConfianza === "insuficiente")).toBe(true);
  });

  it("respeta umbralMinimoMuestra y listas de umbrales/márgenes personalizadas", () => {
    const recos = generarRecomendacionesDeCalibracion([caso()], { umbralMinimoMuestra: 2, umbralesDeScoreASimular: [99], margenesASimular: [1] });
    expect(recos.umbralMinimoMuestra).toBe(2);
    expect(recos.umbralesDeScore).toHaveLength(1);
    expect(recos.umbralesDeScore[0].valorPropuesto).toBe(99);
    expect(recos.margenesDeAmbiguedad).toHaveLength(1);
    expect(recos.margenesDeAmbiguedad[0].valorPropuesto).toBe(1);
  });
});

describe("compararConfiguraciones — CURRENT CONFIG vs PROPOSED CONFIG", () => {
  it("sin ningún parámetro propuesto → cambios vacío, ambas simulaciones null", () => {
    const comparacion = compararConfiguraciones([caso()], {});
    expect(comparacion.cambios).toEqual([]);
    expect(comparacion.margenAmbiguedad).toBeNull();
    expect(comparacion.pesosPorTier).toBeNull();
    expect(comparacion.actual.marginAmbiguedad).toBe(10);
  });

  it("proponer marginAmbiguedad activa únicamente esa simulación", () => {
    const comparacion = compararConfiguraciones([caso()], { marginAmbiguedad: 20 });
    expect(comparacion.cambios).toEqual([{ parametro: "marginAmbiguedad", valorActual: 10, valorPropuesto: 20 }]);
    expect(comparacion.margenAmbiguedad).not.toBeNull();
    expect(comparacion.margenAmbiguedad?.valorPropuesto).toBe(20);
    expect(comparacion.pesosPorTier).toBeNull();
  });

  it("proponer puntosPorTier activa únicamente esa simulación", () => {
    const nuevosPesos = { 1: 50, 2: 22, 3: 12, 4: 5 };
    const comparacion = compararConfiguraciones([caso()], { puntosPorTier: nuevosPesos });
    expect(comparacion.cambios).toEqual([{ parametro: "puntosPorTier", valorActual: { 1: 40, 2: 22, 3: 12, 4: 5 }, valorPropuesto: nuevosPesos }]);
    expect(comparacion.pesosPorTier).not.toBeNull();
    expect(comparacion.margenAmbiguedad).toBeNull();
  });

  it("proponer ambos parámetros activa las dos simulaciones", () => {
    const comparacion = compararConfiguraciones([caso()], { marginAmbiguedad: 15, puntosPorTier: { 1: 45, 2: 22, 3: 12, 4: 5 } });
    expect(comparacion.cambios).toHaveLength(2);
    expect(comparacion.margenAmbiguedad).not.toBeNull();
    expect(comparacion.pesosPorTier).not.toBeNull();
  });

  it("nunca muta CONFIGURACION_ACTUAL ni ningún dato real (estructural: no hay Prisma en este archivo)", () => {
    const antes = JSON.stringify(compararConfiguraciones([caso()], {}).actual);
    compararConfiguraciones([caso()], { marginAmbiguedad: 99, puntosPorTier: { 1: 1, 2: 1, 3: 1, 4: 1 } });
    const despues = JSON.stringify(compararConfiguraciones([caso()], {}).actual);
    expect(despues).toBe(antes);
  });
});
