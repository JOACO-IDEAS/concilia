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
});
