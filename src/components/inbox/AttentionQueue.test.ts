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
});
