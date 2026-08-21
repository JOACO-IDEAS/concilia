import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./OperationalStatusLine.tsx", import.meta.url), "utf8");

describe("OperationalStatusLine — frase de estado operativo (TASK 5.0I.1)", () => {
  it("no renderiza nada cuando statusLine es null — nunca un total parcial inventado", () => {
    expect(source).toContain("if (!statusLine) return null;");
  });

  it("no hardcodea ningún número ni frase de conteo — el texto completo viene de la prop", () => {
    expect(source).not.toMatch(/Hay \d/);
    expect(source).toContain("{statusLine}");
  });
});
