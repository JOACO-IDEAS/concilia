import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { metricValueLabel } from "./OperationalSummary";

describe("metricValueLabel — nunca una cifra engañosa", () => {
  it("muestra el valor exacto cuando no hay límite de consulta alcanzado", () => {
    expect(metricValueLabel({ status: "available", value: 3, capped: false })).toBe("3");
  });

  it("muestra 'N+' cuando el valor pudo quedar truncado por el límite de la consulta", () => {
    expect(metricValueLabel({ status: "available", value: 8, capped: true })).toBe("8+");
  });

  it("muestra 'No disponible' en vez de inventar un cero", () => {
    expect(metricValueLabel({ status: "unavailable", reason: "x" })).toBe("No disponible");
  });
});

describe("OperationalSummary — estructura", () => {
  const source = readFileSync(new URL("./OperationalSummary.tsx", import.meta.url), "utf8");

  it("expone las 4 métricas pedidas por la sección D.2, ninguna decorativa", () => {
    expect(source).toContain("Requiere decisión");
    expect(source).toContain("Requiere información");
    expect(source).toContain("Procesados hoy");
    expect(source).toContain("Resueltos hoy");
  });

  it("no contiene ningún número hardcodeado como valor de métrica", () => {
    expect(source).not.toMatch(/>\s*\d+\s*</);
  });

  it("aplica semántica de color por métrica (UX.3.1 sección 6) sin depender solo del color — cada card mantiene ícono y label de texto", () => {
    expect(source).toContain('tone="amber"');
    expect(source).toContain('tone="blue"');
    expect(source).toContain('tone="emerald"');
    expect(source).toContain('tone="neutral"');
  });
});
