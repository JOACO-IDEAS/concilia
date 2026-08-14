import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./SetupJourney.tsx", import.meta.url), "utf8");

describe("SetupJourney — estado vacío con una única CTA primaria (UX.3.1 sección 5)", () => {
  it("no renderiza más de una lista de pasos (nunca los 6 hitos completos)", () => {
    expect(source).toContain("journey.steps.map");
    expect((source.match(/\.map\(/g) ?? []).length).toBe(1);
  });

  it("solo muestra la CTA primaria si existe — nunca un botón inventado", () => {
    expect(source).toContain("journey.primaryCta ?");
  });

  it("no incluye enlaces inferiores adicionales que compitan con la CTA primaria", () => {
    expect(source).not.toContain("OperationalQuickActions");
    expect((source.match(/<Link/g) ?? []).length).toBe(1);
  });

  it("el texto de cada paso está en un contenedor min-w-0 (evita overflow horizontal en mobile)", () => {
    expect(source).toContain('<div className="min-w-0">');
  });
});
