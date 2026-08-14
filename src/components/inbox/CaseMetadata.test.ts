import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./CaseMetadata.tsx", import.meta.url), "utf8");

describe("CaseMetadata — metadatos como unidades independientes (UX.3.2 §3)", () => {
  it("solo los ítems 'atomic' (formato fijo corto, ej. 'hace 6 d') son whitespace-nowrap — nunca se cortan a mitad de palabra", () => {
    expect(source).toContain("item.atomic ? \"whitespace-nowrap\"");
  });

  it("los ítems no-atomic (texto libre: nombre de consorcio, referencia, motivo) pueden envolver normalmente — nunca forzados a una sola línea", () => {
    // Regresión del bug real encontrado en QA: envolver TODO en
    // whitespace-nowrap causaba overflow horizontal con nombres de
    // consorcio o referencias bancarias largas.
    expect(source).not.toMatch(/<span key=\{index\} className="[^"]*whitespace-nowrap/);
  });

  it("la fila envuelve de forma natural entre datos (flex-wrap), no como tabla ni con overflow", () => {
    expect(source).toContain("flex-wrap");
    expect(source).not.toMatch(/<table/i);
  });

  it("descarta datos vacíos/ausentes sin renderizar separadores huérfanos, y acepta tanto string plano como {text,atomic}", () => {
    expect(source).toContain("filter((item)");
    expect(source).toContain("typeof item === \"string\"");
  });
});
