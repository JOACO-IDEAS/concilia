import { describe, expect, it } from "vitest";
import type { Signal } from "@/lib/reconciliation/types";
import type { CalibrationCase } from "./types";
import { filtrarPatronesConfiables, minarPatrones } from "./pattern-mining";

function senal(overrides: Partial<Signal> = {}): Signal {
  return { signal: "CUIT_EXACT", tier: 1, matched: true, strength: "STRONG", evidence: "", ...overrides };
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
    structuredEvidence: { bank: { signals: [senal()], blockers: [], topCandidates: null }, whatsapp: null },
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

describe("minarPatrones", () => {
  // Escenario #1: dataset vacío.
  it("dataset vacío → sin patrones", () => {
    expect(minarPatrones([])).toEqual([]);
  });

  it("no incluye casos sin ground truth humano (UNRESOLVED/INSUFFICIENT_DATA)", () => {
    const patrones = minarPatrones([caso({ groundTruth: "UNRESOLVED" }), caso({ groundTruth: "INSUFFICIENT_DATA" })]);
    const combinacionSenales = patrones.filter((p) => p.tipo === "SIGNAL_COMBINATION");
    expect(combinacionSenales.every((p) => p.totalCasos === 0)).toBe(true);
  });

  // Escenario "no hardcodear con 1-2 casos": patrón con pocas observaciones queda marcado no confiable.
  it("un patrón con menos observaciones que el umbral queda confiable=false", () => {
    const patrones = minarPatrones([caso(), caso({ paymentTransactionId: "pay-2" })], 5);
    const patronCuit = patrones.find((p) => p.tipo === "SIGNAL_COMBINATION" && p.firma.includes("CUIT_EXACT"));
    expect(patronCuit?.totalCasos).toBe(2);
    expect(patronCuit?.confiable).toBe(false);
  });

  it("un patrón con observaciones suficientes queda confiable=true, y describe la proporción real", () => {
    const casos = Array.from({ length: 5 }, (_, i) => caso({ paymentTransactionId: `pay-${i}` }));
    const patrones = minarPatrones(casos, 5);
    const patronCuit = patrones.find((p) => p.tipo === "SIGNAL_COMBINATION" && p.firma.includes("CUIT_EXACT"));
    expect(patronCuit?.totalCasos).toBe(5);
    expect(patronCuit?.confiable).toBe(true);
    expect(patronCuit?.aprobados).toBe(5);
    expect(patronCuit?.descripcion).toContain("5/5");
  });

  it("filtrarPatronesConfiables descarta los patrones con muestra insuficiente", () => {
    const patrones = minarPatrones([caso(), caso({ paymentTransactionId: "pay-2" })], 5);
    expect(filtrarPatronesConfiables(patrones)).toHaveLength(0);
  });

  it("familias convergentes también se minan como patrón independiente", () => {
    const casos = Array.from({ length: 3 }, (_, i) => caso({ paymentTransactionId: `pay-${i}`, independentFamiliesConverging: ["BANK_MOVEMENT", "WHATSAPP_MESSAGE"] }));
    const patrones = minarPatrones(casos, 3);
    const patronFamilias = patrones.find((p) => p.tipo === "FAMILY_CONVERGENCE" && p.firma.length === 2);
    expect(patronFamilias?.totalCasos).toBe(3);
    expect(patronFamilias?.confiable).toBe(true);
  });

  it("cada patrón trae casosIds con trazabilidad completa (no solo el número)", () => {
    const casos = [caso({ paymentTransactionId: "pay-A" }), caso({ paymentTransactionId: "pay-B" })];
    const patrones = minarPatrones(casos, 1);
    const patronCuit = patrones.find((p) => p.tipo === "SIGNAL_COMBINATION" && p.firma.includes("CUIT_EXACT"));
    expect(patronCuit?.casosIds.sort()).toEqual(["pay-A", "pay-B"]);
  });

  // Fase 5.11 — Regla 3: nunca mezclar ORGANIC/SYNTHETIC_DEMO sin etiquetarlo.
  it("origenDeMuestra separa casos ORGANIC de SYNTHETIC_DEMO dentro del mismo patrón", () => {
    const casos = [
      caso({ paymentTransactionId: "pay-organic", humanDecisionProvenance: "ORGANIC" }),
      caso({ paymentTransactionId: "pay-synth", humanDecisionProvenance: "SYNTHETIC_DEMO" }),
    ];
    const patrones = minarPatrones(casos, 1);
    const patronCuit = patrones.find((p) => p.tipo === "SIGNAL_COMBINATION" && p.firma.includes("CUIT_EXACT"));
    expect(patronCuit?.origenDeMuestra).toEqual({ organic: 1, syntheticDemo: 1 });
    expect(patronCuit?.totalCasos).toBe(2);
  });

  it("casos rechazados por humano se cuentan como 'rechazados' en el patrón, no como aprobados", () => {
    const casos = Array.from({ length: 5 }, (_, i) => caso({ paymentTransactionId: `pay-${i}`, groundTruth: "HUMAN_REJECTED", humanDecision: "REJECTED" }));
    const patrones = minarPatrones(casos, 5);
    const patronCuit = patrones.find((p) => p.tipo === "SIGNAL_COMBINATION" && p.firma.includes("CUIT_EXACT"));
    expect(patronCuit?.rechazados).toBe(5);
    expect(patronCuit?.aprobados).toBe(0);
    expect(patronCuit?.tasaAprobacion).toBe(0);
  });
});
