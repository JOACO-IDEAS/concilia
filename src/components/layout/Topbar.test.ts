import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { initialsFor, organizationLabel } from "./Topbar";

describe("initialsFor", () => {
  it("deriva iniciales reales del nombre, nunca un valor fijo", () => {
    expect(initialsFor("Estudio Fernández")).toBe("EF");
    expect(initialsFor("María")).toBe("MA");
    expect(initialsFor("  Juan   Pérez  ")).toBe("JP");
  });

  it("degrada a cadena vacía sin nombre — el componente usa el ícono neutral en ese caso", () => {
    expect(initialsFor("")).toBe("");
    expect(initialsFor("   ")).toBe("");
  });
});

describe("organizationLabel", () => {
  it("muestra el nombre real cuando hay una sola organización", () => {
    expect(organizationLabel([{ id: "org-1", name: "Consorcio Av. Cabildo 2450" }])).toBe("Consorcio Av. Cabildo 2450");
  });

  it("muestra un conteo, nunca un nombre elegido arbitrariamente, cuando hay varias", () => {
    expect(organizationLabel([{ id: "org-1", name: "A" }, { id: "org-2", name: "B" }])).toBe("2 consorcios");
  });

  it("retorna null sin organizaciones — el Topbar no muestra nada en ese caso", () => {
    expect(organizationLabel([])).toBeNull();
  });
});

describe("Topbar — identidad real, nunca hardcodeada", () => {
  it("no contiene ningún valor de avatar fijo ni la identidad de demostración anterior", () => {
    const source = readFileSync(new URL("./Topbar.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/>\s*EF\s*</);
    expect(source).toContain("useCurrentAdministrator");
    expect(source).toContain("UserRound");
  });

  it("incorpora logout server-side, visible, sin open redirect", () => {
    const source = readFileSync(new URL("./Topbar.tsx", import.meta.url), "utf8");
    expect(source).toContain("logoutAction");
    expect(source).toContain('aria-label="Cerrar sesión"');
    expect(source).toMatch(/<form action=\{logoutAction\}>/);
  });
});
