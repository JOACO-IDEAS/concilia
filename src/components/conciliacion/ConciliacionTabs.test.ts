import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ConciliacionTabs.tsx", import.meta.url), "utf8");

describe("ConciliacionTabs — flujo operativo", () => {
  it("no expone el panel de conciliación mock dentro de la experiencia autenticada", () => {
    expect(source).not.toContain("ReconciliationView");
    expect(source).not.toContain("modo avanzado");
  });
});
