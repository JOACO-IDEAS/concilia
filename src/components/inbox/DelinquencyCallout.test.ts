import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DelinquencyCallout.tsx", import.meta.url), "utf8");

describe("DelinquencyCallout — secundario, sin CTA de WhatsApp falso", () => {
  it("nunca renderiza un botón, formulario o link wa.me propio — solo menciona WhatsApp como descripción de lo que hay en /morosidad", () => {
    expect(source).not.toMatch(/wa\.me|<button|<form|onClick|sendWhatsApp\(/);
  });

  it("no muestra ningún número ni conteo de mora — solo un enlace de salida", () => {
    expect(source).not.toMatch(/\{.*(count|total|monto|deuda).*\}/i);
  });

  it("el destino viene por prop, nunca hardcodeado en el componente", () => {
    expect(source).toContain("href={href}");
    expect(source).not.toContain('"/morosidad"');
  });
});
