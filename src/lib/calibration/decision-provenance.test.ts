import { describe, expect, it } from "vitest";
import { MARCADOR_DECISION_SINTETICA_DEMO, inferirProvenanceDeDecision } from "./decision-provenance";

describe("inferirProvenanceDeDecision", () => {
  it("texto sin ningún marcador → ORGANIC (default seguro)", () => {
    expect(inferirProvenanceDeDecision("CUIT coincide + UF coincide + importe coincide")).toBe("ORGANIC");
  });

  it("reason con el marcador nuevo [SYNTHETIC_DEMO] → SYNTHETIC_DEMO", () => {
    expect(inferirProvenanceDeDecision(`Fase 5.11 ${MARCADOR_DECISION_SINTETICA_DEMO} — caso de prueba`)).toBe("SYNTHETIC_DEMO");
  });

  it("reason con el marcador heredado de Fase 5.10 ('SINTÉTICA') → SYNTHETIC_DEMO", () => {
    expect(inferirProvenanceDeDecision("Fase 5.10 — decisión SINTÉTICA de demostración de calibración (dev-fixtures).")).toBe("SYNTHETIC_DEMO");
  });

  it("el marcador puede estar en rejectionReason en vez de reason", () => {
    expect(inferirProvenanceDeDecision("Rechazo", "Demostración — decisión SINTÉTICA de prueba")).toBe("SYNTHETIC_DEMO");
  });

  it("rejectionReason ausente (caso APPROVED, campo opcional) no rompe la inferencia", () => {
    expect(inferirProvenanceDeDecision("Aprobación real de un administrador")).toBe("ORGANIC");
  });

  it("reason null/undefined → ORGANIC, nunca lanza", () => {
    expect(inferirProvenanceDeDecision(null)).toBe("ORGANIC");
    expect(inferirProvenanceDeDecision(undefined)).toBe("ORGANIC");
  });

  it("los 2 reason reales escritos por 01-registrar-decisiones-demo.mts se detectan como SYNTHETIC_DEMO", () => {
    const reasonAprobado = "Fase 5.10 — decisión SINTÉTICA de demostración de calibración (dev-fixtures). Aprueba el candidato REAL propuesto por el motor real para este pago.";
    const reasonRechazado = "Fase 5.10 — decisión SINTÉTICA de demostración de calibración (dev-fixtures). Rechaza el candidato REAL propuesto por el motor real para este pago, para producir un caso de desacuerdo (FP) demostrable.";
    const rejectionReasonRechazado = "Demostración Fase 5.10 — no hay un administrador real detrás de este rechazo, es un dato sintético para poblar el dataset de calibración con al menos un desacuerdo real.";
    expect(inferirProvenanceDeDecision(reasonAprobado)).toBe("SYNTHETIC_DEMO");
    expect(inferirProvenanceDeDecision(reasonRechazado, rejectionReasonRechazado)).toBe("SYNTHETIC_DEMO");
  });
});
