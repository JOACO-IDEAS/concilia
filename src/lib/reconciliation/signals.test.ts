import { describe, expect, it } from "vitest";
import {
  calcularSenalCuit,
  calcularSenalFecha,
  calcularSenalImporte,
  calcularSenalReferencia,
  calcularSenalTelefono,
  calcularSenalUnitCode,
} from "./signals";
import type { PhoneResolution } from "./types";

// Caso #1: CUIT exacto.
describe("calcularSenalCuit (#1)", () => {
  it("matched=true, Tier 1, STRONG cuando el CUIT coincide exactamente", () => {
    const s = calcularSenalCuit("20-28990011-3", "20289900113");
    expect(s.matched).toBe(true);
    expect(s.tier).toBe(1);
    expect(s.strength).toBe("STRONG");
  });

  it("matched=false cuando los CUIT no coinciden", () => {
    const s = calcularSenalCuit("20289900113", "27123456789");
    expect(s.matched).toBe(false);
  });

  it("matched=false, sin inventar nada, cuando falta el dato en cualquiera de los dos lados", () => {
    expect(calcularSenalCuit(null, "20289900113").matched).toBe(false);
    expect(calcularSenalCuit("20289900113", null).matched).toBe(false);
  });
});

describe("calcularSenalUnitCode", () => {
  it("matched=true cuando el código extraído del concepto coincide con la unidad", () => {
    const s = calcularSenalUnitCode("TRANSF - UF 3A - AGOSTO", "3A");
    expect(s.matched).toBe(true);
    expect(s.tier).toBe(1);
  });

  it("matched=false cuando no hay ningún código extraíble", () => {
    const s = calcularSenalUnitCode("TRANSFERENCIA RECIBIDA", "3A");
    expect(s.matched).toBe(false);
  });
});

// Caso #4: fecha compatible.
describe("calcularSenalFecha (#4)", () => {
  it("matched=true cuando la fecha está dentro de la ventana plausible", () => {
    const s = calcularSenalFecha(new Date("2026-08-05"), { period: new Date("2026-08-01"), dueDate: new Date("2026-08-10") });
    expect(s.matched).toBe(true);
    expect(s.tier).toBe(4);
    expect(s.strength).toBe("WEAK"); // nunca decide sola
  });

  it("matched=false cuando la fecha está muy lejos del vencimiento", () => {
    const s = calcularSenalFecha(new Date("2026-01-01"), { period: new Date("2026-08-01"), dueDate: new Date("2026-08-10") });
    expect(s.matched).toBe(false);
  });

  it("matched=false sin transactionDate disponible (caso real de hoy — 0/40 pagos existentes lo tienen)", () => {
    const s = calcularSenalFecha(null, { period: new Date("2026-08-01"), dueDate: null });
    expect(s.matched).toBe(false);
  });
});

// Caso #5: referencia bancaria.
describe("calcularSenalReferencia (#5)", () => {
  it("matched=true cuando la referencia coincide exactamente con Obligation.externalRef", () => {
    const s = calcularSenalReferencia("REF-998877", "REF-998877");
    expect(s.matched).toBe(true);
    expect(s.tier).toBe(1);
    expect(s.strength).toBe("STRONG");
  });

  it("matched=false cuando las referencias son distintas", () => {
    const s = calcularSenalReferencia("REF-1", "REF-2");
    expect(s.matched).toBe(false);
  });
});

describe("calcularSenalImporte", () => {
  it("nunca colapsa a un genérico 'importe coincide' — expone la categoría real", () => {
    const { signal, assessment } = calcularSenalImporte(145000, [
      { id: "ob-1", period: new Date("2026-08-01"), amount: 145000, paidAmount: 0 },
    ]);
    expect(assessment.category).toBe("EXACTO");
    expect(signal.evidence).toContain("coincide exactamente");
  });
});

describe("calcularSenalTelefono", () => {
  const resolucionUnica: PhoneResolution = {
    case: "SINGLE_CANDIDATE",
    candidates: [{ unitId: "u1", unitOwnerId: "owner-1", organizationId: "org-1" }],
    evidence: "x",
  };

  it("Tier 2 cuando el teléfono está confirmado por historial (#17, insumo para dos Tier 2 independientes)", () => {
    const s = calcularSenalTelefono(resolucionUnica, "owner-1", true);
    expect(s.matched).toBe(true);
    expect(s.tier).toBe(2);
  });

  it("Tier 3 cuando el teléfono coincide pero nunca fue confirmado antes", () => {
    const s = calcularSenalTelefono(resolucionUnica, "owner-1", false);
    expect(s.matched).toBe(true);
    expect(s.tier).toBe(3);
  });

  it("nunca sube de Tier 3 cuando el caso es ambiguo, sin importar el historial", () => {
    const ambigua: PhoneResolution = { case: "AMBIGUOUS_WITHIN_ORG", candidates: [], evidence: "x" };
    const s = calcularSenalTelefono(ambigua, "owner-1", true);
    expect(s.matched).toBe(false);
    expect(s.tier).toBe(3);
  });
});
