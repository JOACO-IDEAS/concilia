import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ResolutionWorkspace.tsx", import.meta.url), "utf8");

describe("ResolutionWorkspace — jerarquía del caso (TASK UX 5.0)", () => {
  it("el título del caso es el importe real (nunca truncado) con la organización como contexto secundario, no una frase genérica", () => {
    expect(source).toMatch(/<h2[^>]*whitespace-nowrap[^>]*>\s*\{formatMonto\(payment\.amount, payment\.currency\)\}/);
    expect(source).toContain("{payment.organizationName}");
    expect(source).not.toContain("Revisá el movimiento y decidí con contexto.");
  });

  it("separa la evidencia (C) de la conclusión de la propuesta (B) en su propia Card, usando EvidenceList", () => {
    expect(source).toContain('import { EvidenceList } from "./EvidenceList"');
    expect(source).toContain('title="Evidencia"');
    const evidenciaIndex = source.indexOf('title="Evidencia"');
    const decisionIndex = source.indexOf('title="¿Qué podés decidir?"');
    expect(evidenciaIndex).toBeGreaterThan(-1);
    expect(evidenciaIndex).toBeLessThan(decisionIndex);
  });

  it("no inventa un score de confianza para la propuesta principal — el contrato de datos no lo expone", () => {
    expect(source).not.toMatch(/confidence/i);
    expect(source).not.toMatch(/%\s*de confianza/);
  });

  it("distingue cada evento del historial por su origen (sistema vs. decisión humana) en vez de un ícono único", () => {
    expect(source).toContain("historyIcon");
    expect(source).toContain("historyTone");
    expect(source).toMatch(/RECEIVED:\s*Inbox/);
    expect(source).toMatch(/APPROVED:\s*ThumbsUp/);
    expect(source).toMatch(/REJECTED:\s*ThumbsDown/);
  });

  it("mantiene las secciones A→F en orden: resumen, propuesta, evidencia, decisión, historial", () => {
    const order = ["¿Qué pasó?", "¿Qué propone ConcilIA?", "Evidencia", "¿Qué podés decidir?", "¿Qué pasó antes?"];
    const indexes = order.map((title) => source.indexOf(`title="${title}"`));
    expect(indexes.every((index) => index > -1)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });
});
