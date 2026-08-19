import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./RejectionForm.tsx", import.meta.url), "utf8");

describe("RejectionForm — formulario de motivo compartido (TASK UX 5.0)", () => {
  it("no permite confirmar sin un motivo escrito", () => {
    expect(source).toContain("!reason.trim() || pending");
  });

  it("deshabilita cancelar, confirmar y el textarea mientras la decisión está en curso (protección de doble submit)", () => {
    expect(source).toContain("disabled={pending}");
    expect(source).toMatch(/disabled=\{!reason\.trim\(\) \|\| pending\}/);
  });

  it("recibe la pregunta como prop — no hardcodea el texto de un único caso de uso", () => {
    expect(source).toContain("question");
    expect(source).not.toContain("¿Por qué se rechaza?");
    expect(source).not.toContain("¿Por qué ninguno es correcto?");
  });
});
