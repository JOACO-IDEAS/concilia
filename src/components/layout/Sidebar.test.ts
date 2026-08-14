import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");

describe("Sidebar — navegación canónica del piloto", () => {
  it("contiene exactamente los 4 destinos canónicos decididos por Product Owner", () => {
    expect(source).toContain('{ href: "/", label: "Inicio"');
    expect(source).toContain('{ href: "/conciliacion", label: "Conciliación"');
    expect(source).toContain('{ href: "/consorcios", label: "Consorcios"');
    expect(source).toContain('{ href: "/configuracion", label: "Configuración"');
  });

  it("no expone módulos experimentales, incompletos, huérfanos o de diagnóstico", () => {
    const prohibited = [
      "/ia",
      "/conversaciones",
      "/dashboard",
      "/morosidad",
      "/reportes",
      "/panel-operativo",
      "/bandeja-de-trabajo",
      "/unidades-config",
      "/unidades",
      "/obligaciones",
      "/importar",
      "/actividad",
      "shadow-matching",
    ];
    for (const path of prohibited) {
      expect(source).not.toContain(`href: "${path}"`);
    }
  });
});
