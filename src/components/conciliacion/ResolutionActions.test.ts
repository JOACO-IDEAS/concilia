import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ResolutionActions — fallback de candidatos sin enlace roto", () => {
  it("no enlaza a la ruta histórica rota; usa el destino canónico funcional", () => {
    const source = readFileSync(new URL("./ResolutionActions.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("/conciliacion/revision-humana");
    expect(source).toContain('href="/conciliacion"');
  });
});
