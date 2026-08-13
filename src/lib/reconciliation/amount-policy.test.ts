import { describe, expect, it } from "vitest";
import { clasificarImporte, TOLERANCIA_REDONDEO_ARS, type ObligacionCandidata } from "./amount-policy";

function obligacion(overrides: Partial<ObligacionCandidata> = {}): ObligacionCandidata {
  return { id: "ob-1", period: new Date("2026-08-01"), amount: 145000, paidAmount: 0, ...overrides };
}

// Caso #19: ausencia de obligación.
describe("clasificarImporte — sin obligación (#19)", () => {
  it("categoriza SIN_OBLIGACION cuando no hay ninguna obligación abierta", () => {
    const r = clasificarImporte(145000, []);
    expect(r.category).toBe("SIN_OBLIGACION");
    expect(r.obligationId).toBeNull();
  });
});

// Caso #3: importe exacto contra obligación.
describe("clasificarImporte — importe exacto (#3)", () => {
  it("categoriza EXACTO cuando el importe coincide byte a byte con el saldo pendiente", () => {
    const r = clasificarImporte(145000, [obligacion()]);
    expect(r.category).toBe("EXACTO");
    expect(r.obligationId).toBe("ob-1");
  });
});

// Caso #12: tolerancia de $1.
describe("clasificarImporte — tolerancia de redondeo (#12)", () => {
  it("categoriza COMPATIBLE_REDONDEO dentro de la tolerancia aprobada de $1 ARS", () => {
    expect(TOLERANCIA_REDONDEO_ARS).toBe(1);
    const r = clasificarImporte(145000.5, [obligacion({ amount: 145000 })]);
    expect(r.category).toBe("COMPATIBLE_REDONDEO");
  });

  it("NO categoriza como compatible una diferencia mayor a la tolerancia", () => {
    const r = clasificarImporte(145005, [obligacion({ amount: 145000 })]);
    expect(r.category).not.toBe("EXACTO");
    expect(r.category).not.toBe("COMPATIBLE_REDONDEO");
  });
});

describe("clasificarImporte — pago parcial", () => {
  it("categoriza PARCIAL cuando el importe es menor al saldo pendiente", () => {
    const r = clasificarImporte(70000, [obligacion({ amount: 145000 })]);
    expect(r.category).toBe("PARCIAL");
  });
});

// Caso #10: múltiples obligaciones abiertas simultáneamente.
describe("clasificarImporte — múltiples obligaciones (#10) y FIFO como desempate (#11)", () => {
  it("con dos obligaciones igualmente compatibles, elige la más antigua (FIFO)", () => {
    const agosto = obligacion({ id: "ob-agosto", period: new Date("2026-08-01"), amount: 145000 });
    const septiembre = obligacion({ id: "ob-septiembre", period: new Date("2026-09-01"), amount: 145000 });
    // Julio, más antigua todavía, debe ganar por FIFO aunque las tres calcen.
    const julio = obligacion({ id: "ob-julio", period: new Date("2026-07-01"), amount: 145000 });

    const r = clasificarImporte(145000, [septiembre, agosto, julio]); // orden de entrada deliberadamente desordenado
    expect(r.category).toBe("EXACTO");
    expect(r.obligationId).toBe("ob-julio");
  });

  it("el excedente cubre la obligación más antigua primero y la siguiente, en orden FIFO", () => {
    const agosto = obligacion({ id: "ob-agosto", period: new Date("2026-08-01"), amount: 145000 });
    const septiembre = obligacion({ id: "ob-septiembre", period: new Date("2026-09-01"), amount: 130000 });

    const r = clasificarImporte(275000, [septiembre, agosto]);
    expect(r.category).toBe("EXCEDENTE");
    expect(r.obligationId).toBe("ob-agosto"); // la más antigua de las cubiertas
  });

  it("FIFO nunca cambia la categoría del resultado — solo desempata cuál obligación", () => {
    // Dos obligaciones con saldos MUY distintos: FIFO no debe forzar un
    // "compatible" donde no lo hay.
    const agosto = obligacion({ id: "ob-agosto", period: new Date("2026-08-01"), amount: 999999 });
    const septiembre = obligacion({ id: "ob-septiembre", period: new Date("2026-09-01"), amount: 145000 });

    const r = clasificarImporte(145000, [agosto, septiembre]);
    expect(r.category).toBe("EXACTO");
    expect(r.obligationId).toBe("ob-septiembre"); // NO la más antigua — FIFO no aplica cuando no hay empate real
  });
});

describe("clasificarImporte — importe superior sin explicar", () => {
  it("categoriza SUPERIOR_SIN_EXPLICAR cuando el excedente no calza con ninguna combinación de obligaciones", () => {
    const r = clasificarImporte(999999, [obligacion({ amount: 145000 })]);
    expect(r.category).toBe("SUPERIOR_SIN_EXPLICAR");
  });
});
