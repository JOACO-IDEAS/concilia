import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./RecommendedNextStep.tsx", import.meta.url), "utf8");

describe("RecommendedNextStep — una sola recomendación, nunca inventada", () => {
  it("no renderiza nada cuando no hay siguiente paso — ausencia real, no un CTA inventado", () => {
    expect(source).toContain("if (!nextStep) return null;");
  });

  it("el CTA usa el href y el label reales del view model, no un texto ni ruta fija", () => {
    expect(source).toContain("nextStep.href");
    expect(source).toContain("nextStep.actionLabel");
  });

  it("no es una lista — un único bloque de recomendación", () => {
    expect(source).not.toMatch(/\.map\(/);
  });
});
