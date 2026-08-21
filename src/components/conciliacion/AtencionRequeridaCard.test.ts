import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./AtencionRequeridaCard.tsx", import.meta.url), "utf8");

describe("AtencionRequeridaCard — cola de excepciones (TASK UX 5.0)", () => {
  it("siempre vive dentro de una Card con encabezado, incluso con la lista vacía — nunca retorna null en silencio", () => {
    expect(source).not.toMatch(/if \(items\.length === 0\) return null;/);
    expect(source).toContain("Todo al día. No hay pagos esperando tu aprobación.");
  });

  it("muestra un conteo real de casos en el encabezado, derivado de items.length — nunca un número fijo", () => {
    expect(source).toMatch(/\{items\.length\}\s*\{items\.length === 1 \? "caso" : "casos"\}/);
  });

  it("reutiliza formatMonto compartido — sin una implementación local duplicada", () => {
    expect(source).toContain('import { formatMonto } from "@/lib/format"');
    expect(source).not.toMatch(/function formatMonto/);
  });

  it("usa CaseMetadata para el dato del pagador, en vez de un párrafo que pueda desbordar", () => {
    expect(source).toContain("CaseMetadata");
  });

  it("TASK 5.0I.1 — la confianza de la sugerencia se muestra como etiqueta cualitativa, nunca como porcentaje crudo", () => {
    expect(source).not.toMatch(/\{item\.sugerencia\.confidence\}%/);
    expect(source).not.toContain("% de confianza");
    expect(source).toContain('"Alta confianza"');
    expect(source).toContain('"Requiere revisión"');
    expect(source).toContain('"Evidencia insuficiente"');
  });
});
