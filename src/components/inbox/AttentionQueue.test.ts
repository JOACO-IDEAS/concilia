import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./AttentionQueue.tsx", import.meta.url), "utf8");

describe("AttentionQueue — prioridad principal de Inicio", () => {
  it("distingue 3 estados: no disponible, todo al día, y casos reales — nunca colapsa 'no disponible' en 'todo al día'", () => {
    expect(source).toContain("Todo al día");
    expect(source).toContain("no está disponible en este entorno todavía");
    expect(source).not.toContain("/conciliacion/revision-humana");
  });

  it("cuando la cola no está disponible, ofrece una salida real a Conciliación, no un callejón sin salida", () => {
    expect(source).toContain('href="/conciliacion"');
  });

  it("cada caso muestra razón, organización y monto — nunca solo un número sin contexto", () => {
    expect(source).toContain("item.organizationName");
    expect(source).toContain("item.amountLabel");
    expect(source).toContain("item.reason");
  });

  it("usa CaseMetadata para que cada dato pueda envolver como unidad, sin formar un único párrafo corrido (UX.3.2 §3)", () => {
    expect(source).toContain("CaseMetadata");
    expect(source).toContain("item.organizationName");
    expect(source).toContain("item.reason");
  });

  it("solo el importe (formato fijo corto) se marca atomic — el nombre del consorcio y la razón pueden ser largos y deben poder envolver", () => {
    expect(source).toMatch(/\{ text: item\.amountLabel, atomic: true \}/);
    expect(source).not.toMatch(/\{ text: item\.organizationName, atomic: true \}/);
    expect(source).not.toMatch(/\{ text: item\.reason, atomic: true \}/);
  });
});
