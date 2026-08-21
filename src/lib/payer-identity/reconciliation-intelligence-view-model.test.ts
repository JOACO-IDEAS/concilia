import { describe, expect, it } from "vitest";
import type { UnknownPayerCandidate, UnknownPayerResolution } from "./unknown-payer-resolution";
import { toReconciliationIntelligenceViewModel } from "./reconciliation-intelligence-view-model";

function candidate(unitId: string, overrides: Partial<UnknownPayerCandidate> = {}): UnknownPayerCandidate {
  return {
    unitId, unitCode: unitId.toUpperCase(), obligationId: `ob-${unitId}`, financialScore: 90, identityMemoryScore: 0, decisionScore: 90,
    historical: { supportCount: 0, contradictionCount: 0, state: "NONE", sources: [], contribution: 0, disputed: false, revokedIgnored: false, deduplicatedByProvenance: false },
    reasons: [{ kind: "FINANCIAL", detail: `El importe coincide con la obligación de ${unitId}.` }, { kind: "CORRELATION", detail: "El movimiento tiene evidencia compatible." }],
    ...overrides,
  };
}

function resolution(overrides: Partial<UnknownPayerResolution> = {}): UnknownPayerResolution {
  const primary = candidate("5b");
  return { status: "RESOLVED_CANDIDATE", candidates: [primary], primaryCandidate: primary, explanation: [], requiresConfirmation: true, diagnostics: { historyChangedRanking: false, historyRemovedConfirmation: false, historicalConflict: false }, provenance: { organizationId: "org-1", payerId: null, signalId: "signal-1", durableCorrelation: true, financialScoring: "EXISTING_MATCHER", historicalMemory: "SIGNAL_UNIT_ASSOCIATION" }, ...overrides };
}

describe("reconciliation intelligence view model", () => {
  it("mapea resolved con confirmación sin recalcular policy", () => {
    expect(toReconciliationIntelligenceViewModel(resolution())).toMatchObject({ heading: "ConcilIA propone", summary: "Unidad 5B", confidenceLabel: "Requiere revisión", requiresConfirmation: true });
  });

  it("resolved sin confirmación dice alta confianza pero nunca AUTO/ejecutado", () => {
    const model = toReconciliationIntelligenceViewModel(resolution({ requiresConfirmation: false }));
    expect(model).toMatchObject({ confidenceLabel: "Alta confianza", confirmationMessage: "No requiere confirmación según la evidencia disponible." });
    expect(JSON.stringify(model)).not.toMatch(/AUTO|automátic|ejecutad/i);
  });

  it("mantiene evidencia financiera e histórica separadas", () => {
    const historical = candidate("5b", { historical: { supportCount: 4, contradictionCount: 0, state: "OBSERVED", sources: ["SIGNAL"], contribution: 16, disputed: false, revokedIgnored: false, deduplicatedByProvenance: false }, reasons: [{ kind: "FINANCIAL", detail: "Importe exacto." }, { kind: "HISTORICAL_SUPPORT", detail: "4 soportes históricos activos." }] });
    const model = toReconciliationIntelligenceViewModel(resolution({ candidates: [historical], primaryCandidate: historical }));
    expect(model.financialEvidence).toEqual([{ text: "Importe exacto.", status: "match" }]);
    expect(model.historicalEvidence).toEqual([{ text: "4 soportes históricos activos.", status: "match" }]);
  });

  it("AMBIGUOUS presenta candidatos reales y pide decisión", () => {
    const candidates = [candidate("2a"), candidate("7c", { financialScore: 88, decisionScore: 88 })];
    expect(toReconciliationIntelligenceViewModel(resolution({ status: "AMBIGUOUS", candidates, primaryCandidate: null }))).toMatchObject({ heading: "Necesitamos tu decisión", candidates: [{ unitCode: "2A" }, { unitCode: "7C" }] });
  });

  it("historical conflict queda explícito", () => {
    const model = toReconciliationIntelligenceViewModel(resolution({ status: "AMBIGUOUS", primaryCandidate: null, diagnostics: { historyChangedRanking: true, historyRemovedConfirmation: false, historicalConflict: true } }));
    expect(model.historicalConflict).toBe(true);
    expect(model.historicalEvidence).toContainEqual({ text: "La evidencia actual y el historial no coinciden.", status: "conflict" });
  });

  it("multi-unit history no colapsa candidatos", () => {
    const historic = (id: string) => candidate(id, { historical: { supportCount: 3, contradictionCount: 0, state: "OBSERVED", sources: ["SIGNAL"], contribution: 12, disputed: false, revokedIgnored: false, deduplicatedByProvenance: false } });
    const model = toReconciliationIntelligenceViewModel(resolution({ status: "AMBIGUOUS", candidates: [historic("4b"), historic("7a")], primaryCandidate: null }));
    expect(model.multiUnitHistory).toBe(true);
    expect(model.historicalEvidence.at(-1)?.text).toContain("varias unidades");
  });

  it("DISPUTED se presenta como precaución", () => {
    const disputed = candidate("5b", { historical: { supportCount: 5, contradictionCount: 1, state: "DISPUTED", sources: ["SIGNAL"], contribution: 3, disputed: true, revokedIgnored: false, deduplicatedByProvenance: false }, reasons: [{ kind: "HISTORICAL_STATE", detail: "La asociación histórica está disputada; su contribución fue degradada." }] });
    const model = toReconciliationIntelligenceViewModel(resolution({ candidates: [disputed], primaryCandidate: disputed }));
    expect(model.disputedHistory).toBe(true);
    expect(model.historicalEvidence[0].status).toBe("conflict");
  });

  it("REVOKED nunca se muestra como soporte positivo", () => {
    const revoked = candidate("5b", { historical: { supportCount: 0, contradictionCount: 0, state: "NONE", sources: [], contribution: 0, disputed: false, revokedIgnored: true, deduplicatedByProvenance: false }, reasons: [{ kind: "HISTORICAL_STATE", detail: "La evidencia histórica revocada fue ignorada." }] });
    const model = toReconciliationIntelligenceViewModel(resolution({ candidates: [revoked], primaryCandidate: revoked }));
    expect(model.historicalEvidence).toEqual([{ text: "La evidencia histórica revocada fue ignorada.", status: "missing" }]);
  });

  it("insufficient distingue candidatos accionables de ausencia", () => {
    expect(toReconciliationIntelligenceViewModel(resolution({ status: "INSUFFICIENT_EVIDENCE", primaryCandidate: null })).summary).toContain("candidatos para revisar");
    expect(toReconciliationIntelligenceViewModel(resolution({ status: "INSUFFICIENT_EVIDENCE", candidates: [], primaryCandidate: null })).summary).toContain("No hay un candidato accionable");
  });

  it("NO_CANDIDATES no inventa recomendaciones", () => {
    const model = toReconciliationIntelligenceViewModel(resolution({ status: "NO_CANDIDATES", candidates: [], primaryCandidate: null }));
    expect(model).toMatchObject({ heading: "No encontramos una unidad compatible", candidates: [], primaryCandidate: null });
    expect(model.financialEvidence).toEqual([]);
    expect(model.historicalEvidence).toEqual([]);
  });

  it("sin history degrada con un fallback veraz", () => {
    const model = toReconciliationIntelligenceViewModel(resolution());
    expect(model.historicalEvidence).toEqual([]);
    expect(model.disputedHistory).toBe(false);
    expect(model.multiUnitHistory).toBe(false);
  });
});
