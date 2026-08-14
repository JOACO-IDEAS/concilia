import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./OperationalHeader.tsx", import.meta.url), "utf8");
// El bloque /** */ de arriba menciona "<h1>" como documentación — se excluye
// antes de verificar JSX real, para no producir un falso positivo.
const sourceWithoutComments = source.replace(/\/\*\*[\s\S]*?\*\//g, "");

describe("OperationalHeader — identidad real, sin duplicar el <h1> del Topbar", () => {
  it("nunca renderiza un <h1> — el Topbar ya define el único h1 de la página", () => {
    expect(sourceWithoutComments).not.toMatch(/<h1[\s>]/);
  });

  it("deriva la identidad del mismo contexto real que usa el Topbar, sin ninguna consulta propia", () => {
    expect(source).toContain("useCurrentAdministrator");
    expect(source).toContain('from "@/lib/auth/current-administrator-context"');
    expect(source).not.toMatch(/prisma/i);
  });

  it("reutiliza organizationLabel del Topbar en vez de duplicar la lógica de '/consorcios'", () => {
    expect(source).toContain("organizationLabel");
    expect(source).toContain('from "@/components/layout/Topbar"');
  });

  it("el saludo es neutral cuando no hay nombre — nunca un nombre hardcodeado", () => {
    expect(source).toContain('"Hola"');
    expect(source).not.toMatch(/"EF"|"Juan|"María/);
  });
});
