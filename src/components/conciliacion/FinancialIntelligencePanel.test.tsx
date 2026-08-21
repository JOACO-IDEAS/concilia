import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReconciliationIntelligenceViewModel } from "@/lib/payer-identity/reconciliation-intelligence-view-model";
import { FinancialIntelligencePanel } from "./FinancialIntelligencePanel";

const intelligence: ReconciliationIntelligenceViewModel = {
  status: "AMBIGUOUS", heading: "Necesitamos tu decisión", summary: "2 candidatos requieren comparación.", confidenceLabel: "Requiere revisión", requiresConfirmation: true, confirmationMessage: "Elegí la unidad correcta o rechazá los candidatos.", primaryCandidate: null,
  candidates: ["2A", "7C"].map((unitCode, index) => ({ unitId: `unit-${index}`, unitCode, financialEvidence: [{ text: "Importe compatible", status: "match" }], historicalEvidence: [], financialScore: 90 - index, historicalContribution: 0, decisionScore: 90 - index })),
  financialEvidence: [{ text: "Importe compatible", status: "match" }], historicalEvidence: [{ text: "La evidencia actual y el historial no coinciden.", status: "conflict" }], historicalConflict: true, multiUnitHistory: false, disputedHistory: false, technicalDetailAvailable: true,
};

describe("FinancialIntelligencePanel", () => {
  it("usa jerarquía semántica, alert y progressive disclosure accesible", () => {
    const html = renderToStaticMarkup(<FinancialIntelligencePanel intelligence={intelligence} />);
    expect(html).toContain('aria-labelledby="intelligence-heading"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Evidencia financiera");
    expect(html).toContain("Historial");
    expect(html).toContain("<details");
    expect(html).toContain("Ver evidencia completa");
    expect(html).toContain("Unidad 2A");
    expect(html).not.toContain("overflow-hidden");
  });

  it("no comunica status únicamente por color", () => {
    const html = renderToStaticMarkup(<FinancialIntelligencePanel intelligence={intelligence} />);
    expect(html).toContain("Requiere revisión");
    expect(html).toContain("La evidencia actual y el historial no coinciden");
  });
});
