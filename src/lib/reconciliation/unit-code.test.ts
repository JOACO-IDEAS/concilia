import { describe, expect, it } from "vitest";
import { canonicalizarCodigoUnidad, extraerCodigoUnidadDeTexto } from "./unit-code";

// Caso #2 del pedido: Unit.code exacto — los 6 ejemplos textuales deben
// colapsar al mismo canónico, y la comparación debe seguir siendo exacta
// sobre esa forma (nunca fuzzy).
describe("canonicalizarCodigoUnidad", () => {
  it("colapsa las 6 variantes del pedido al mismo canónico", () => {
    const variantes = ["3A", "3 A", "UF 3A", "UF3A", "3-a", "3°A"];
    const canonicos = variantes.map(canonicalizarCodigoUnidad);
    expect(new Set(canonicos).size).toBe(1);
    expect(canonicos[0]).toBe("3A");
  });

  it("nunca trata códigos numéricamente cercanos como iguales (no hay fuzzy matching)", () => {
    expect(canonicalizarCodigoUnidad("3A")).not.toBe(canonicalizarCodigoUnidad("5A"));
    expect(canonicalizarCodigoUnidad("3A")).not.toBe(canonicalizarCodigoUnidad("3B"));
  });

  it("reconoce el prefijo UNIDAD/DEPTO/PISO además de UF", () => {
    expect(canonicalizarCodigoUnidad("UNIDAD 3A")).toBe("3A");
    expect(canonicalizarCodigoUnidad("DEPTO 3A")).toBe("3A");
    expect(canonicalizarCodigoUnidad("PISO 3A")).toBe("3A");
  });
});

describe("extraerCodigoUnidadDeTexto", () => {
  it("extrae un código con prefijo reconocido de un concepto bancario real", () => {
    const extraido = extraerCodigoUnidadDeTexto("TRANSF - UF 3A - AGOSTO");
    expect(extraido).not.toBeNull();
    expect(canonicalizarCodigoUnidad(extraido!)).toBe("3A");
  });

  it("devuelve null cuando no hay ningún código plausible (conservador, no adivina)", () => {
    expect(extraerCodigoUnidadDeTexto("TRANSFERENCIA RECIBIDA")).toBeNull();
  });
});
