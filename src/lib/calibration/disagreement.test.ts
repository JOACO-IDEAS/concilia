import { describe, expect, it } from "vitest";
import type { CalibrationCase } from "./types";
import { analizarDesacuerdos, clasificarDesacuerdo, resumirCausas } from "./disagreement";

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
    groundTruth: "HUMAN_REJECTED",
    humanDecision: "REJECTED",
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

describe("clasificarDesacuerdo", () => {
  it("TP/TN no son desacuerdos → null", () => {
    expect(clasificarDesacuerdo(caso({ groundTruth: "HUMAN_CONFIRMED", engineState: "PRE_CONCILIABLE" }))).toBeNull();
    expect(clasificarDesacuerdo(caso({ groundTruth: "HUMAN_REJECTED", engineState: "NEEDS_DATA" }))).toBeNull();
  });

  it("UNRESOLVED/INSUFFICIENT_DATA no son desacuerdos calibrables → null", () => {
    expect(clasificarDesacuerdo(caso({ groundTruth: "UNRESOLVED" }))).toBeNull();
    expect(clasificarDesacuerdo(caso({ groundTruth: "INSUFFICIENT_DATA" }))).toBeNull();
  });

  // Escenario #13: falso positivo — con structuredEvidence pero sin blockers/contradicción → "false_positive_probable".
  it("FP con structuredEvidence limpio (sin blockers ni contradicción) → false_positive_probable", () => {
    const r = clasificarDesacuerdo(
      caso({ groundTruth: "HUMAN_REJECTED", engineState: "PRE_CONCILIABLE", structuredEvidence: { bank: { signals: [], blockers: [], topCandidates: null }, whatsapp: null } })
    );
    expect(r?.categoria).toBe("FP");
    expect(r?.causa).toBe("false_positive_probable");
  });

  // Escenario #14: falso negativo — con structuredEvidence pero sin blockers/contradicción → "false_negative_probable".
  it("FN con structuredEvidence limpio (sin blockers ni contradicción) → false_negative_probable", () => {
    const r = clasificarDesacuerdo(
      caso({ groundTruth: "HUMAN_CONFIRMED", engineState: "NEEDS_DATA", structuredEvidence: { bank: { signals: [], blockers: [], topCandidates: null }, whatsapp: null } })
    );
    expect(r?.categoria).toBe("FN");
    expect(r?.causa).toBe("false_negative_probable");
  });

  it("hasContradiction=true → contradictory_evidence, con prioridad sobre cualquier blocker", () => {
    const r = clasificarDesacuerdo(
      caso({
        groundTruth: "HUMAN_REJECTED",
        engineState: "PRE_CONCILIABLE",
        hasContradiction: true,
        contradictionDetail: "Bancos y WhatsApp proponen unidades distintas.",
        structuredEvidence: { bank: { signals: [], blockers: [{ type: "PHONE_AMBIGUOUS", evidence: "..." }], topCandidates: null }, whatsapp: null },
      })
    );
    expect(r?.causa).toBe("contradictory_evidence");
    expect(r?.detalle).toBe("Bancos y WhatsApp proponen unidades distintas.");
  });

  it("blocker PHONE_AMBIGUOUS → phone_ambiguity", () => {
    const r = clasificarDesacuerdo(
      caso({
        groundTruth: "HUMAN_REJECTED",
        structuredEvidence: { bank: { signals: [], blockers: [{ type: "PHONE_AMBIGUOUS", evidence: "Teléfono compartido por 2 unidades." }], topCandidates: null }, whatsapp: null },
      })
    );
    expect(r?.causa).toBe("phone_ambiguity");
  });

  it("blocker DUPLICATE → duplicate_candidate", () => {
    const r = clasificarDesacuerdo(
      caso({
        groundTruth: "HUMAN_REJECTED",
        structuredEvidence: { bank: { signals: [], blockers: [{ type: "DUPLICATE", evidence: "Ya existe un pago igual." }], topCandidates: null }, whatsapp: null },
      })
    );
    expect(r?.causa).toBe("duplicate_candidate");
  });

  it("blocker MULTIPLE_EQUIVALENT_CANDIDATES → ambiguous_identity", () => {
    const r = clasificarDesacuerdo(
      caso({
        groundTruth: "HUMAN_REJECTED",
        structuredEvidence: { bank: { signals: [], blockers: [{ type: "MULTIPLE_EQUIVALENT_CANDIDATES", evidence: "2 candidatos." }], topCandidates: null }, whatsapp: null },
      })
    );
    expect(r?.causa).toBe("ambiguous_identity");
  });

  it("sin structuredEvidence → insufficient_structured_data", () => {
    const r = clasificarDesacuerdo(caso({ groundTruth: "HUMAN_REJECTED", structuredEvidence: null }));
    expect(r?.causa).toBe("insufficient_structured_data");
  });

  it("nunca inventa una causa distinta de las provistas por los datos (nunca 'unknown' salvo que se agregue explícitamente esa rama)", () => {
    const r = clasificarDesacuerdo(caso({ groundTruth: "HUMAN_REJECTED", structuredEvidence: { bank: { signals: [], blockers: [], topCandidates: null }, whatsapp: null } }));
    expect(["false_positive_probable", "false_negative_probable", "unknown"]).toContain(r?.causa);
  });
});

describe("analizarDesacuerdos / resumirCausas", () => {
  it("agrega solo los desacuerdos reales y cuenta causas", () => {
    const evidenciaLimpia: CalibrationCase["structuredEvidence"] = { bank: { signals: [], blockers: [], topCandidates: null }, whatsapp: null };
    const casos = [
      caso({ groundTruth: "HUMAN_CONFIRMED", engineState: "PRE_CONCILIABLE" }), // TP, no es desacuerdo
      caso({ groundTruth: "HUMAN_REJECTED", engineState: "PRE_CONCILIABLE", structuredEvidence: evidenciaLimpia }), // FP
      caso({ groundTruth: "HUMAN_REJECTED", engineState: "PRE_CONCILIABLE", structuredEvidence: evidenciaLimpia }), // FP
    ];
    const desacuerdos = analizarDesacuerdos(casos);
    expect(desacuerdos).toHaveLength(2);
    const resumen = resumirCausas(desacuerdos);
    expect(resumen[0]).toEqual({ causa: "false_positive_probable", cantidad: 2 });
  });
});
