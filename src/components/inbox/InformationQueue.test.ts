import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./InformationQueue.tsx", import.meta.url), "utf8");

describe("InformationQueue — qué falta y por qué bloquea", () => {
  it("cada caso muestra la razón honesta (nunca inventada por caso individual)", () => {
    expect(source).toContain("payment.reason");
  });

  it("tiene un empty state real, distinto de un placeholder genérico", () => {
    expect(source).toContain("No hay pagos asociados a tus consorcios esperando más información");
  });

  it("cada caso conduce a una acción real (Investigar), no solo muestra el dato", () => {
    expect(source).toContain("Investigar");
    expect(source).toContain("payment.href");
  });

  it("usa CaseMetadata (consorcio/importe/referencia/antigüedad como unidades separadas, no un párrafo único — UX.3.2 §3)", () => {
    expect(source).toContain("CaseMetadata");
    expect(source).toContain("payment.organizationName");
    expect(source).toContain("payment.referenceLabel");
  });

  it("importe y antigüedad (formato fijo corto, ej. 'hace 6 d') son atomic; consorcio y referencia libre pueden envolver normalmente", () => {
    expect(source).toMatch(/\{ text: payment\.amountLabel, atomic: true \}/);
    expect(source).toMatch(/\{ text: payment\.ageLabel, atomic: true \}/);
    expect(source).not.toMatch(/\{ text: payment\.organizationName, atomic: true \}/);
    expect(source).not.toMatch(/\{ text: payment\.referenceLabel, atomic: true \}/);
  });
});
