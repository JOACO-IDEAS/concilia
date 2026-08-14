import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");

describe("RootLayout — identidad real propagada al shell", () => {
  it("reutiliza la misma llamada de requireCurrentAdministrator() ya existente, sin una segunda consulta redundante de identidad", () => {
    const matches = source.match(/await requireCurrentAdministrator\(\)/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("carga organizaciones reales y las propaga junto con el administrador vía contexto", () => {
    expect(source).toContain("loadOrganizationsForAdministrator(administrator.id)");
    expect(source).toContain("CurrentAdministratorProvider");
    expect(source).toContain("value={currentAdministrator}");
  });

  it("mantiene el redirect a /acceso ante fallo de autenticación, sin cambios de comportamiento", () => {
    expect(source).toContain('redirect("/acceso")');
  });
});
