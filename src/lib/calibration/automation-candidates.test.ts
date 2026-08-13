import { describe, expect, it } from "vitest";
import type { CalibrationCase } from "./types";
import { detectarCandidatosDeAutomatizacion } from "./automation-candidates";

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
    structuredEvidence: { bank: { signals: [{ signal: "CUIT_EXACT", tier: 1, matched: true, strength: "STRONG", evidence: "" }], blockers: [], topCandidates: null }, whatsapp: null },
    hasContradiction: false,
    contradictionDetail: null,
    explanation: "",
    evaluatedAt: "2026-01-01T00:00:00.000Z",
    groundTruth: "HUMAN_CONFIRMED",
    humanDecision: "APPROVED",
    humanDecidedAt: "2026-01-02T00:00:00.000Z", // viernes (UTC)
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

describe("detectarCandidatosDeAutomatizacion", () => {
  it("dataset vacío → nunca lanza, dimensiones medibles devuelven arrays vacíos, las 2 no medibles siguen presentes", () => {
    const candidatos = detectarCandidatosDeAutomatizacion([]);
    const noMedibles = candidatos.filter((c) => !c.medible);
    expect(noMedibles).toHaveLength(2);
    expect(noMedibles.map((c) => c.tipo).sort()).toEqual(["SAME_ORGANIZATION_BEHAVIOR", "SAME_UNIT_OR_OBLIGATION_TYPE"]);
    expect(noMedibles.every((c) => c.razonNoMedible !== null && c.datoAdicionalNecesario !== null)).toBe(true);
  });

  it("las 2 dimensiones sin dato estructural SIEMPRE reportan medible=false, sin importar el dataset", () => {
    const casos = Array.from({ length: 10 }, (_, i) => caso({ paymentTransactionId: `pay-${i}` }));
    const candidatos = detectarCandidatosDeAutomatizacion(casos);
    const unitOrgTipo = candidatos.find((c) => c.tipo === "SAME_UNIT_OR_OBLIGATION_TYPE");
    const orgBehavior = candidatos.find((c) => c.tipo === "SAME_ORGANIZATION_BEHAVIOR");
    expect(unitOrgTipo?.medible).toBe(false);
    expect(orgBehavior?.medible).toBe(false);
  });

  // Patrón con alta concordancia: N casos, misma evidencia, siempre la misma decisión → 0 excepciones.
  it("patrón con alta concordancia (0 excepciones, muestra ORGANIC suficiente) → riesgo bajo, confianza alta", () => {
    const casos = Array.from({ length: 10 }, (_, i) => caso({ paymentTransactionId: `pay-${i}`, groundTruth: "HUMAN_CONFIRMED", humanDecisionProvenance: "ORGANIC" }));
    const candidatos = detectarCandidatosDeAutomatizacion(casos, { umbralMinimoMuestra: 5 });
    const patron = candidatos.find((c) => c.tipo === "SAME_EVIDENCE_SAME_DECISION" && c.clave === "CUIT_EXACT");
    expect(patron?.totalCasos).toBe(10);
    expect(patron?.excepciones).toBe(0);
    expect(patron?.decisionesConcordantes).toBe(10);
    expect(patron?.confianzaEstadistica).toBe("alta");
    expect(patron?.riesgoDeAutomatizar).toBe("bajo");
  });

  // Patrón con excepciones: misma evidencia, pero una decisión discrepante dentro del grupo.
  it("patrón con excepciones → riesgo alto, sin importar cuán buena sea la confianza", () => {
    const casos = [
      ...Array.from({ length: 9 }, (_, i) => caso({ paymentTransactionId: `pay-${i}`, groundTruth: "HUMAN_CONFIRMED", humanDecisionProvenance: "ORGANIC" })),
      caso({ paymentTransactionId: "pay-excepcion", groundTruth: "HUMAN_REJECTED", humanDecisionProvenance: "ORGANIC" }),
    ];
    const candidatos = detectarCandidatosDeAutomatizacion(casos, { umbralMinimoMuestra: 5 });
    const patron = candidatos.find((c) => c.tipo === "SAME_EVIDENCE_SAME_DECISION" && c.clave === "CUIT_EXACT");
    expect(patron?.totalCasos).toBe(10);
    expect(patron?.excepciones).toBe(1);
    expect(patron?.decisionesConcordantes).toBe(9);
    expect(patron?.confianzaEstadistica).toBe("alta"); // 10 organic >= 2*5
    expect(patron?.riesgoDeAutomatizar).toBe("alto"); // excepciones > 0 domina sobre la confianza
  });

  it("muestra 100% SYNTHETIC_DEMO → confianza insuficiente, riesgo no_evaluable, nunca 'bajo'", () => {
    const casos = Array.from({ length: 10 }, (_, i) => caso({ paymentTransactionId: `pay-${i}`, humanDecisionProvenance: "SYNTHETIC_DEMO" }));
    const candidatos = detectarCandidatosDeAutomatizacion(casos, { umbralMinimoMuestra: 5 });
    const patron = candidatos.find((c) => c.tipo === "SAME_EVIDENCE_SAME_DECISION" && c.clave === "CUIT_EXACT");
    expect(patron?.confianzaEstadistica).toBe("insuficiente");
    expect(patron?.riesgoDeAutomatizar).toBe("no_evaluable");
  });

  it("SAME_REJECTION_REASON agrupa por el texto real de rejectionReason, ignora casos sin rechazo", () => {
    const casos = [
      caso({ paymentTransactionId: "pay-1", groundTruth: "HUMAN_REJECTED", humanRejectionReason: "No corresponde a esta unidad" }),
      caso({ paymentTransactionId: "pay-2", groundTruth: "HUMAN_REJECTED", humanRejectionReason: "No corresponde a esta unidad" }),
      caso({ paymentTransactionId: "pay-3", groundTruth: "HUMAN_CONFIRMED", humanRejectionReason: null }),
    ];
    const candidatos = detectarCandidatosDeAutomatizacion(casos, { umbralMinimoMuestra: 1 });
    const patron = candidatos.find((c) => c.tipo === "SAME_REJECTION_REASON");
    expect(patron?.clave).toBe("No corresponde a esta unidad");
    expect(patron?.totalCasos).toBe(2);
  });

  it("SAME_CONTRADICTION_TYPE agrupa solo casos con hasContradiction=true y contradictionDetail no nulo", () => {
    const casos = [
      caso({ paymentTransactionId: "pay-1", hasContradiction: true, contradictionDetail: "CUIT_CONTRADICTORY" }),
      caso({ paymentTransactionId: "pay-2", hasContradiction: false, contradictionDetail: null }),
    ];
    const candidatos = detectarCandidatosDeAutomatizacion(casos, { umbralMinimoMuestra: 1 });
    const patron = candidatos.find((c) => c.tipo === "SAME_CONTRADICTION_TYPE");
    expect(patron?.totalCasos).toBe(1);
    expect(patron?.clave).toBe("CUIT_CONTRADICTORY");
  });

  it("SAME_FAMILY_COMBINATION agrupa por independentFamiliesConverging ordenada", () => {
    const casos = [
      caso({ paymentTransactionId: "pay-1", independentFamiliesConverging: ["WHATSAPP_MESSAGE", "BANK_MOVEMENT"] }),
      caso({ paymentTransactionId: "pay-2", independentFamiliesConverging: ["BANK_MOVEMENT", "WHATSAPP_MESSAGE"] }),
    ];
    const candidatos = detectarCandidatosDeAutomatizacion(casos, { umbralMinimoMuestra: 1 });
    const patron = candidatos.find((c) => c.tipo === "SAME_FAMILY_COMBINATION" && c.clave === "BANK_MOVEMENT+WHATSAPP_MESSAGE");
    expect(patron?.totalCasos).toBe(2); // mismo orden alfabético, mismo grupo
  });

  it("SAME_SCORE_RANGE agrupa por bucket de 20 puntos, ignora casos sin score", () => {
    const casos = [caso({ paymentTransactionId: "pay-1", engineScore: 85 }), caso({ paymentTransactionId: "pay-2", engineScore: 81 }), caso({ paymentTransactionId: "pay-3", engineScore: null })];
    const candidatos = detectarCandidatosDeAutomatizacion(casos, { umbralMinimoMuestra: 1 });
    const patron = candidatos.find((c) => c.tipo === "SAME_SCORE_RANGE" && c.clave === "80-99");
    expect(patron?.totalCasos).toBe(2);
  });

  it("SAME_TEMPORAL_PATTERN agrupa por día de semana de humanDecidedAt", () => {
    const casos = [caso({ paymentTransactionId: "pay-1", humanDecidedAt: "2026-01-02T00:00:00.000Z" }), caso({ paymentTransactionId: "pay-2", humanDecidedAt: "2026-01-09T00:00:00.000Z" })]; // ambos viernes
    const candidatos = detectarCandidatosDeAutomatizacion(casos, { umbralMinimoMuestra: 1 });
    const patron = candidatos.find((c) => c.tipo === "SAME_TEMPORAL_PATTERN" && c.clave === "viernes");
    expect(patron?.totalCasos).toBe(2);
  });

  it("nunca incluye UNRESOLVED/INSUFFICIENT_DATA en ninguna dimensión medible", () => {
    const casos = [caso({ paymentTransactionId: "pay-1", groundTruth: "UNRESOLVED" }), caso({ paymentTransactionId: "pay-2", groundTruth: "INSUFFICIENT_DATA" })];
    const candidatos = detectarCandidatosDeAutomatizacion(casos, { umbralMinimoMuestra: 1 });
    const medibles = candidatos.filter((c) => c.medible);
    expect(medibles.every((c) => c.totalCasos === 0)).toBe(true);
  });
});
