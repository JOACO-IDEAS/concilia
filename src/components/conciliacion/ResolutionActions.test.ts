import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ResolutionActions — fallback de candidatos sin enlace roto", () => {
  const source = readFileSync(new URL("./ResolutionActions.tsx", import.meta.url), "utf8");

  it("no enlaza a la ruta histórica rota; usa el destino canónico funcional", () => {
    expect(source).not.toContain("/conciliacion/revision-humana");
    expect(source).toContain('href="/conciliacion"');
  });

  it("TASK UX 5.0 — reutiliza RejectionForm en vez de duplicar el bloque de rechazo por candidato único y por 'ninguno correcto'", () => {
    expect(source).toContain('import { RejectionForm } from "./RejectionForm"');
    expect((source.match(/<RejectionForm/g) ?? []).length).toBe(2);
    expect(source).not.toMatch(/¿Por qué se rechaza\?[\s\S]*¿Por qué se rechaza\?/);
  });

  it("TASK UX 5.0 — muestra las señales de cada candidato con EvidenceList en vez de un texto plano truncable", () => {
    expect(source).toContain('import { EvidenceList } from "./EvidenceList"');
    expect(source).toContain("candidate.matchedSignals");
    expect(source).not.toContain("Coincidencias: ");
  });

  it("TASK UX 5.0 — todas las acciones se deshabilitan mientras hay una decisión en curso, incluida la de otros candidatos (doble submit)", () => {
    expect(source).toContain("const isBusy = pending !== null");
    expect((source.match(/disabled=\{isBusy\}/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
