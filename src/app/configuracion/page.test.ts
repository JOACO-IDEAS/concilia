import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("ConfiguracionPage — superficie de cliente", () => {
  it("no revela proveedores internos ni deriva estados visibles de variables de entorno", () => {
    expect(source).not.toContain("process.env");
    expect(source).not.toMatch(/Neon|OpenAI|Resend|Meta Cloud|Webhook/);
  });

  it("explica honestamente que todavía no hay preferencias disponibles", () => {
    expect(source).toContain("No hay preferencias para configurar todavía");
  });
});
