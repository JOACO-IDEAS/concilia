import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./EvidenceList.tsx", import.meta.url), "utf8");

describe("EvidenceList — bloque reutilizable de evidencia (TASK UX 5.0)", () => {
  it("distingue visualmente coincidencia, conflicto y ausencia — no un único ícono genérico", () => {
    expect(source).toContain('status === "conflict"');
    expect(source).toContain('status === "missing"');
    expect(source).toContain("CheckCircle2");
  });

  it("normaliza strings sueltos como coincidencia — hoy es lo único que expone structuredEvidence", () => {
    expect(source).toMatch(/status: "match" as const/);
  });

  it("no renderiza una lista vacía en silencio — exige un emptyMessage explícito por caso de uso", () => {
    expect(source).toContain("emptyMessage");
    expect(source).toContain("normalized.length === 0");
  });
});
