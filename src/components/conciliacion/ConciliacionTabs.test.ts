import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ConciliacionTabs.tsx", import.meta.url), "utf8");

describe("ConciliacionTabs — flujo operativo", () => {
  it("no expone el panel de conciliación mock dentro de la experiencia autenticada", () => {
    expect(source).not.toContain("ReconciliationView");
    expect(source).not.toContain("modo avanzado");
  });

  it("TASK UX 5.0 — administrar por excepción: la cola de atención va antes que la carga de un extracto nuevo", () => {
    const atencionIndex = source.indexOf("<AtencionRequeridaCard");
    const ingestionIndex = source.indexOf("<StatementIngestionPanel");
    expect(atencionIndex).toBeGreaterThan(-1);
    expect(ingestionIndex).toBeGreaterThan(-1);
    expect(atencionIndex).toBeLessThan(ingestionIndex);
  });
});
