import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./OperationalQuickActions.tsx", import.meta.url), "utf8");

describe("OperationalQuickActions — solo rutas reales, sin lista fija en el componente", () => {
  it("la lista de acciones viene del view model como prop, no está hardcodeada en el componente", () => {
    expect(source).not.toMatch(/href=["']\/(conciliacion|importar|unidades-config)["']/);
    expect(source).toContain("actions.map");
  });

  it("no renderiza nada si no hay acciones — nunca un contenedor vacío", () => {
    expect(source).toContain("if (actions.length === 0) return null;");
  });
});
