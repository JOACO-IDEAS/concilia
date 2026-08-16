import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const headerSearchSource = readFileSync(new URL("./HeaderSearch.tsx", import.meta.url), "utf8");
const searchActionsSource = readFileSync(new URL("../../app/search-actions.ts", import.meta.url), "utf8");

describe("HeaderSearch — el placeholder describe exactamente lo que busca (TASK CLAUDE UX.4 §C.1)", () => {
  it("el placeholder no promete buscar 'unidad' — la búsqueda real sólo cubre consorcios", () => {
    expect(headerSearchSource).toContain('placeholder="Buscar consorcio…"');
    expect(headerSearchSource).not.toMatch(/placeholder="[^"]*unidad/i);
  });

  it("la función real de búsqueda sólo consulta organizaciones (Prisma), nunca units — confirma que el placeholder es honesto", () => {
    expect(searchActionsSource).toContain("prisma.organization.findMany");
    expect(searchActionsSource).not.toMatch(/prisma\.unit\.findMany/);
  });

  it("el resultado de la búsqueda etiqueta la sección como 'Consorcios', consistente con lo que realmente devuelve", () => {
    expect(headerSearchSource).toContain("Consorcios");
  });

  it("el comentario de search-actions.ts describe el destino real de navegación (/unidades-config), no uno desactualizado", () => {
    expect(headerSearchSource).toContain('ir("/unidades-config")');
    expect(searchActionsSource).toContain("/unidades-config");
    // Regresión: el comentario decía "/conciliacion" mientras el código
    // navegaba a otro destino — ya no debe quedar ese destino obsoleto.
    expect(searchActionsSource).not.toMatch(/navega a `\/conciliacion`/);
  });
});
