import { describe, expect, it } from "vitest";
import { CONFIGURACION_ACTUAL, MARGEN_AMBIGUEDAD_ACTUAL, PUNTOS_POR_TIER_ACTUAL, VENTANA_FECHA_DIAS_ACTUAL } from "./config-snapshot";

describe("config-snapshot", () => {
  it("MARGEN_AMBIGUEDAD_ACTUAL coincide con deterministic-matcher.ts:52", () => {
    expect(MARGEN_AMBIGUEDAD_ACTUAL).toBe(10);
  });

  it("PUNTOS_POR_TIER_ACTUAL coincide con confidence-engine.ts:14", () => {
    expect(PUNTOS_POR_TIER_ACTUAL).toEqual({ 1: 40, 2: 22, 3: 12, 4: 5 });
  });

  it("VENTANA_FECHA_DIAS_ACTUAL coincide con signals.ts:14", () => {
    expect(VENTANA_FECHA_DIAS_ACTUAL).toBe(45);
  });

  it("CONFIGURACION_ACTUAL agrupa exactamente los 3 parámetros reales, ninguno inventado", () => {
    expect(CONFIGURACION_ACTUAL).toEqual({
      marginAmbiguedad: 10,
      puntosPorTier: { 1: 40, 2: 22, 3: 12, 4: 5 },
      ventanaFechaDias: 45,
    });
    expect(Object.keys(CONFIGURACION_ACTUAL).sort()).toEqual(["marginAmbiguedad", "puntosPorTier", "ventanaFechaDias"]);
  });
});
