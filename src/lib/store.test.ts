import { describe, expect, it } from "vitest";
import { createEmptyAppState } from "./store";

describe("createEmptyAppState", () => {
  it("no inicializa el shell autenticado con fixtures como si fueran datos operativos", () => {
    expect(createEmptyAppState()).toEqual({
      consorcios: [],
      unidades: [],
      transacciones: [],
      reglas: [],
      actividad: [],
    });
  });
});
