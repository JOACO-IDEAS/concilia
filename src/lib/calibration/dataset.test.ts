import { describe, expect, it } from "vitest";
import type { EvidenceFamilyResult } from "@/lib/payment-evidence/evidence-score";
import type { PaymentEvidenceAssessmentRecord } from "@/lib/payment-evidence/evidence-score-store";
import { construirDatasetDeCalibracion, type DecisionHumanaReal } from "./dataset";

function familiaBanco(overrides: Partial<EvidenceFamilyResult> = {}): EvidenceFamilyResult {
  return { family: "BANK_MOVEMENT", nature: "POSITIVE", present: true, unitId: "unit-1", unitCode: "UF 2B", score: 85, tier: 1, detail: "✓ CUIT coincide.", ...overrides };
}
function familiaWhatsapp(overrides: Partial<EvidenceFamilyResult> = {}): EvidenceFamilyResult {
  return { family: "WHATSAPP_MESSAGE", nature: "MISSING", present: false, unitId: null, unitCode: null, score: null, tier: null, detail: "Sin comprobante.", ...overrides };
}
function familiaHistoria(overrides: Partial<EvidenceFamilyResult> = {}): EvidenceFamilyResult {
  return { family: "HISTORY", nature: "MISSING", present: false, unitId: null, unitCode: null, score: null, tier: null, detail: "No se computa.", ...overrides };
}

function evaluacion(overrides: Partial<PaymentEvidenceAssessmentRecord> = {}): PaymentEvidenceAssessmentRecord {
  return {
    id: "eval-1",
    paymentTransactionId: "pay-1",
    engineVersion: "5.7.0",
    state: "PRE_CONCILIABLE",
    candidateUnitId: "unit-1",
    families: [familiaWhatsapp(), familiaBanco(), familiaHistoria()],
    independentFamiliesConverging: ["BANK_MOVEMENT"],
    hasContradiction: false,
    contradictionDetail: null,
    explanation: "Movimiento bancario identificado.",
    structuredEvidence: null,
    evaluatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
function decisionHumana(overrides: Partial<DecisionHumanaReal> = {}): DecisionHumanaReal {
  return { id: "dec-1", paymentTransactionId: "pay-1", unitId: "unit-1", decision: "APPROVED", createdAt: "2026-01-02T00:00:00.000Z", ...overrides };
}

describe("construirDatasetDeCalibracion", () => {
  // Escenario #1: dataset vacío.
  it("sin evaluaciones → dataset vacío", () => {
    expect(construirDatasetDeCalibracion([], [])).toEqual([]);
  });

  // Escenario #2: dataset con una sola decisión humana.
  it("una evaluación + una decisión APPROVED vinculable → un caso HUMAN_CONFIRMED", () => {
    const casos = construirDatasetDeCalibracion([evaluacion()], [decisionHumana()]);
    expect(casos).toHaveLength(1);
    expect(casos[0].groundTruth).toBe("HUMAN_CONFIRMED");
    expect(casos[0].engineScore).toBe(85);
    expect(casos[0].tier).toBe(1);
  });

  // Escenario #3: motor positivo (PRE_CONCILIABLE) + humano APPROVED.
  it("motor PRE_CONCILIABLE + humano APPROVED produce un caso con groundTruth HUMAN_CONFIRMED", () => {
    const [caso] = construirDatasetDeCalibracion([evaluacion({ state: "PRE_CONCILIABLE" })], [decisionHumana({ decision: "APPROVED" })]);
    expect(caso.engineState).toBe("PRE_CONCILIABLE");
    expect(caso.groundTruth).toBe("HUMAN_CONFIRMED");
  });

  // Escenario #4: motor positivo + humano REJECTED.
  it("motor PRE_CONCILIABLE + humano REJECTED produce groundTruth HUMAN_REJECTED", () => {
    const [caso] = construirDatasetDeCalibracion([evaluacion({ state: "PRE_CONCILIABLE" })], [decisionHumana({ decision: "REJECTED" })]);
    expect(caso.groundTruth).toBe("HUMAN_REJECTED");
  });

  // Escenario #5: motor negativo (sin candidato) + humano APPROVED — no debería poder vincularse (candidateUnitId null).
  it("motor sin candidato (NEEDS_DATA, candidateUnitId null) nunca se vincula, aunque exista una decisión APPROVED del pago", () => {
    const [caso] = construirDatasetDeCalibracion(
      [evaluacion({ state: "NEEDS_DATA", candidateUnitId: null, families: [familiaWhatsapp(), familiaBanco({ nature: "MISSING", present: false, unitId: null, score: null, tier: null }), familiaHistoria()], independentFamiliesConverging: [] })],
      [decisionHumana({ decision: "APPROVED" })]
    );
    expect(caso.groundTruth).toBe("UNRESOLVED");
    expect(caso.engineScore).toBeNull();
  });

  // Escenario #6: caso sin decisión humana.
  it("evaluación sin ninguna decisión del pago → INSUFFICIENT_DATA", () => {
    const [caso] = construirDatasetDeCalibracion([evaluacion()], []);
    expect(caso.groundTruth).toBe("INSUFFICIENT_DATA");
    expect(caso.humanDecision).toBeNull();
  });

  // Escenario #8: caso sin structuredEvidence.
  it("evaluación sin structuredEvidence se construye igual, con structuredEvidence null", () => {
    const [caso] = construirDatasetDeCalibracion([evaluacion({ structuredEvidence: null })], [decisionHumana()]);
    expect(caso.structuredEvidence).toBeNull();
    expect(caso.groundTruth).toBe("HUMAN_CONFIRMED");
  });

  // Escenario #9: múltiples evaluaciones del mismo pago.
  it("dos evaluaciones del mismo pago, distinto engineVersion, generan dos casos independientes", () => {
    const casos = construirDatasetDeCalibracion(
      [evaluacion({ id: "eval-1", engineVersion: "5.6.0", evaluatedAt: "2026-01-01T00:00:00.000Z" }), evaluacion({ id: "eval-2", engineVersion: "5.7.0", evaluatedAt: "2026-01-03T00:00:00.000Z" })],
      [decisionHumana({ createdAt: "2026-01-04T00:00:00.000Z" })]
    );
    expect(casos).toHaveLength(2);
    expect(casos[0].evidenceScoreVersion).toBe("5.6.0");
    expect(casos[1].evidenceScoreVersion).toBe("5.7.0");
    // Solo la evaluación más reciente y anterior a la decisión debe quedar vinculada.
    expect(casos[0].groundTruth).toBe("UNRESOLVED");
    expect(casos[1].groundTruth).toBe("HUMAN_CONFIRMED");
  });

  // Escenario #10: bankEngineVersion viene de ShadowMatchLog, es independiente de evidenceScoreVersion.
  it("bankEngineVersion se toma de versionesMotor (ShadowMatchLog), separado de evidenceScoreVersion", () => {
    const [caso] = construirDatasetDeCalibracion([evaluacion({ engineVersion: "5.7.0" })], [], [{ paymentTransactionId: "pay-1", engineVersion: "3.9.0" }]);
    expect(caso.evidenceScoreVersion).toBe("5.7.0");
    expect(caso.bankEngineVersion).toBe("3.9.0");
  });

  // Escenario #20: el dataset se construye completo aun sin ninguna versión de ShadowMatchLog.
  it("sin datos de ShadowMatchLog, el caso se construye igual con bankEngineVersion null", () => {
    const [caso] = construirDatasetDeCalibracion([evaluacion()], [decisionHumana()], []);
    expect(caso.bankEngineVersion).toBeNull();
    expect(caso.groundTruth).toBe("HUMAN_CONFIRMED");
  });

  it("origin por defecto es REAL; se puede marcar SYNTHETIC explícitamente", () => {
    const [real] = construirDatasetDeCalibracion([evaluacion()], []);
    const [sintetico] = construirDatasetDeCalibracion([evaluacion()], [], [], { origin: "SYNTHETIC" });
    expect(real.origin).toBe("REAL");
    expect(sintetico.origin).toBe("SYNTHETIC");
  });
});

// Fase 5.13 — cierre del loop selección-multicandidato: construirDatasetDeCalibracion
// con `opciones.candidatosAmbiguosPorEvaluacionId` (resuelto por loader.ts).
function evaluacionAmbigua(overrides: Partial<PaymentEvidenceAssessmentRecord> = {}): PaymentEvidenceAssessmentRecord {
  return evaluacion({
    id: "eval-ambiguo",
    state: "NEEDS_DECISION",
    candidateUnitId: null,
    families: [familiaWhatsapp(), familiaBanco({ nature: "NEGATIVE", unitId: null, score: null, tier: null }), familiaHistoria()],
    independentFamiliesConverging: [],
    explanation: "Hay más de una unidad compatible. Falta evidencia que permita diferenciarlas.",
    ...overrides,
  });
}

describe("construirDatasetDeCalibracion — casos AMBIGUOS (Fase 5.13)", () => {
  // Escenario A: AMBIGUOUS + humano elige UF 1A → HUMAN_CONFIRMED + candidato vinculado.
  it("APPROVED sobre un candidato real de una evaluación ambigua → HUMAN_CONFIRMED, humanConfirmedUnitId = ese candidato", () => {
    const candidatosPorEvaluacionId = new Map([["eval-ambiguo", ["unit-1A", "unit-2B", "unit-2A"]]]);
    const [caso] = construirDatasetDeCalibracion(
      [evaluacionAmbigua()],
      [decisionHumana({ id: "dec-1a", unitId: "unit-1A", decision: "APPROVED" })],
      [],
      { candidatosAmbiguosPorEvaluacionId: candidatosPorEvaluacionId }
    );
    expect(caso.groundTruth).toBe("HUMAN_CONFIRMED");
    expect(caso.humanConfirmedUnitId).toBe("unit-1A");
    expect(caso.candidateUnitId).toBeNull(); // NUNCA se inventa candidateUnitId en la evaluación original
    expect(caso.engineState).toBe("NEEDS_DECISION"); // NUNCA se convierte artificialmente en PRE_CONCILIABLE
  });

  // Escenario B: elegir otro candidato del mismo conjunto.
  it("APPROVED sobre OTRO candidato (2B en vez de 1A) → vinculado a 2B", () => {
    const candidatosPorEvaluacionId = new Map([["eval-ambiguo", ["unit-1A", "unit-2B", "unit-2A"]]]);
    const [caso] = construirDatasetDeCalibracion(
      [evaluacionAmbigua()],
      [decisionHumana({ id: "dec-2b", unitId: "unit-2B", decision: "APPROVED" })],
      [],
      { candidatosAmbiguosPorEvaluacionId: candidatosPorEvaluacionId }
    );
    expect(caso.groundTruth).toBe("HUMAN_CONFIRMED");
    expect(caso.humanConfirmedUnitId).toBe("unit-2B");
  });

  // Escenario C: "ninguno es correcto" → HUMAN_REJECTED + motivo preservado, sin candidato confirmado.
  it("rechazo de todos los candidatos (una REJECTED por cada uno) → HUMAN_REJECTED, motivo preservado, humanConfirmedUnitId=null", () => {
    const candidatosPorEvaluacionId = new Map([["eval-ambiguo", ["unit-1A", "unit-2B", "unit-2A"]]]);
    const decisiones = [
      decisionHumana({ id: "dec-1", unitId: "unit-1A", decision: "REJECTED", createdAt: "2026-01-02T00:00:00.000Z", rejectionReason: "Ninguno corresponde." }),
      decisionHumana({ id: "dec-2", unitId: "unit-2B", decision: "REJECTED", createdAt: "2026-01-02T00:00:01.000Z", rejectionReason: "Ninguno corresponde." }),
      decisionHumana({ id: "dec-3", unitId: "unit-2A", decision: "REJECTED", createdAt: "2026-01-02T00:00:02.000Z", rejectionReason: "Ninguno corresponde." }),
    ];
    const [caso] = construirDatasetDeCalibracion([evaluacionAmbigua()], decisiones, [], { candidatosAmbiguosPorEvaluacionId: candidatosPorEvaluacionId });
    expect(caso.groundTruth).toBe("HUMAN_REJECTED");
    expect(caso.humanConfirmedUnitId).toBeNull();
    expect(caso.humanRejectionReason).toBe("Ninguno corresponde.");
  });

  // Fase 5.14 — decidedBy de la decisión vinculada se propaga a humanDecidedBy.
  it("decisión con decidedBy real → humanDecidedBy expone ese Administrator.id", () => {
    const [caso] = construirDatasetDeCalibracion([evaluacion()], [decisionHumana({ decidedBy: "admin-1" })]);
    expect(caso.humanDecidedBy).toBe("admin-1");
  });

  // Fase 5.14 — decisiones históricas (previas al sistema real de auth) no traen decidedBy: nunca se inventa.
  it("decisión sin decidedBy (histórica) → humanDecidedBy null", () => {
    const [caso] = construirDatasetDeCalibracion([evaluacion()], [decisionHumana()]);
    expect(caso.humanDecidedBy).toBeNull();
  });

  // Fase 5.14 — sin ninguna decisión vinculada, humanDecidedBy también null (mismo criterio que humanRejectionReason).
  it("sin decisión vinculada (INSUFFICIENT_DATA) → humanDecidedBy null", () => {
    const [caso] = construirDatasetDeCalibracion([evaluacion()], []);
    expect(caso.groundTruth).toBe("INSUFFICIENT_DATA");
    expect(caso.humanDecidedBy).toBeNull();
  });

  // Fase 5.15 — score de la decisión vinculada se propaga a humanDecisionScore, mismo patrón que humanDecidedBy.
  it("decisión con score real → humanDecisionScore expone ese score", () => {
    const [caso] = construirDatasetDeCalibracion([evaluacion()], [decisionHumana({ score: 85 })]);
    expect(caso.humanDecisionScore).toBe(85);
  });

  it("decisión sin score (vínculo manual sin scoring) → humanDecisionScore null", () => {
    const [caso] = construirDatasetDeCalibracion([evaluacion()], [decisionHumana()]);
    expect(caso.humanDecisionScore).toBeNull();
  });

  it("sin decisión vinculada (INSUFFICIENT_DATA) → humanDecisionScore null", () => {
    const [caso] = construirDatasetDeCalibracion([evaluacion()], []);
    expect(caso.humanDecisionScore).toBeNull();
  });

  // Escenario D: en dev-fixtures (provenance por texto SYNTHETIC_DEMO) — vale para los 3 casos anteriores igual.
  it("una decisión SYNTHETIC_DEMO sobre un caso ambiguo nunca es ORGANIC", () => {
    const candidatosPorEvaluacionId = new Map([["eval-ambiguo", ["unit-1A"]]]);
    const [caso] = construirDatasetDeCalibracion(
      [evaluacionAmbigua()],
      [decisionHumana({ id: "dec-1a", unitId: "unit-1A", decision: "APPROVED", reason: "[SYNTHETIC_DEMO] elegido en dev-fixtures" })],
      [],
      { candidatosAmbiguosPorEvaluacionId: candidatosPorEvaluacionId }
    );
    expect(caso.humanDecisionProvenance).toBe("SYNTHETIC_DEMO");
  });

  // Escenario F: los candidatos NO elegidos permanecen sin decisión — no aparecen vinculados a nada.
  it("los candidatos no elegidos no generan ningún CalibrationCase adicional ni ground truth propio", () => {
    const candidatosPorEvaluacionId = new Map([["eval-ambiguo", ["unit-1A", "unit-2B", "unit-2A"]]]);
    const [caso] = construirDatasetDeCalibracion(
      [evaluacionAmbigua()],
      [decisionHumana({ id: "dec-1a", unitId: "unit-1A", decision: "APPROVED" })],
      [],
      { candidatosAmbiguosPorEvaluacionId: candidatosPorEvaluacionId }
    );
    // Solo existe 1 CalibrationCase (uno por evaluación, no uno por candidato) — 2B/2A no generan casos propios.
    expect(caso.humanConfirmedUnitId).toBe("unit-1A");
    expect(caso.humanConfirmedUnitId).not.toBe("unit-2B");
    expect(caso.humanConfirmedUnitId).not.toBe("unit-2A");
  });

  // Escenario G: sin ninguna decisión humana, sigue INSUFFICIENT_DATA (nunca UNRESOLVED "por descarte").
  it("evaluación ambigua sin ninguna decisión humana del pago → INSUFFICIENT_DATA", () => {
    const candidatosPorEvaluacionId = new Map([["eval-ambiguo", ["unit-1A", "unit-2B"]]]);
    const [caso] = construirDatasetDeCalibracion([evaluacionAmbigua()], [], [], { candidatosAmbiguosPorEvaluacionId: candidatosPorEvaluacionId });
    expect(caso.groundTruth).toBe("INSUFFICIENT_DATA");
    expect(caso.humanConfirmedUnitId).toBeNull();
  });

  it("sin candidatosAmbiguosPorEvaluacionId (opción ausente), el comportamiento es idéntico al de antes de Fase 5.13 — UNRESOLVED", () => {
    const [caso] = construirDatasetDeCalibracion([evaluacionAmbigua()], [decisionHumana({ unitId: "unit-1A", decision: "APPROVED" })]);
    expect(caso.groundTruth).toBe("UNRESOLVED");
  });
});
