import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./OperationalEmptyState.tsx", import.meta.url), "utf8");

describe("OperationalEmptyState — primitiva compartida sin defaults genéricos", () => {
  it("exige ícono y mensaje del llamador — sin mensaje por defecto tipo 'no hay datos'", () => {
    expect(source).not.toMatch(/=\s*["']No hay datos["']/i);
    expect(source).toContain("message: string");
  });
});
