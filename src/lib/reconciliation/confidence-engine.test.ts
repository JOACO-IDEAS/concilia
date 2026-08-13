import { describe, expect, it } from "vitest";
import { calcularConfianza } from "./confidence-engine";
import type { Signal } from "./types";

function signal(overrides: Partial<Signal>): Signal {
  return { signal: "NAME_SIMILARITY", tier: 4, matched: true, strength: "WEAK", evidence: "x", ...overrides };
}

// Caso #15: candidato con señales débiles únicamente.
describe("calcularConfianza — solo señales débiles (#15)", () => {
  it("nunca califica para AUTO con únicamente señales Tier 3/4", () => {
    const r = calcularConfianza([
      signal({ signal: "NAME_SIMILARITY", tier: 4, matched: true }),
      signal({ signal: "EMAIL_MATCH", tier: 3, matched: true }),
    ]);
    expect(r.wouldQualifyForAuto).toBe(false);
    expect(r.tier).toBe(3); // el más fuerte de las que matchearon
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(50); // score bajo, coherente con evidencia débil
  });

  it("score=0 y tier=null cuando ninguna señal matcheó", () => {
    const r = calcularConfianza([signal({ matched: false }), signal({ signal: "EMAIL_MATCH", matched: false })]);
    expect(r.score).toBe(0);
    expect(r.tier).toBeNull();
    expect(r.wouldQualifyForAuto).toBe(false);
  });
});

// Caso #16: candidato con Tier 1.
describe("calcularConfianza — Tier 1 (#16)", () => {
  it("una sola señal Tier 1 ya califica para AUTO", () => {
    const r = calcularConfianza([signal({ signal: "CUIT_EXACT", tier: 1, matched: true, strength: "STRONG" })]);
    expect(r.wouldQualifyForAuto).toBe(true);
    expect(r.tier).toBe(1);
  });
});

// Caso #17: dos Tier 2 independientes.
describe("calcularConfianza — dos Tier 2 independientes (#17)", () => {
  it("califica para AUTO cuando hay dos señales Tier 2 de FUENTES distintas", () => {
    const r = calcularConfianza([
      signal({ signal: "AMOUNT_MATCH", tier: 2, matched: true, strength: "STRONG" }), // fuente: amount
      signal({ signal: "PHONE_MATCH", tier: 2, matched: true, strength: "STRONG" }), // fuente: phone
    ]);
    expect(r.wouldQualifyForAuto).toBe(true);
  });

  it("UNA sola señal Tier 2 nunca alcanza sola", () => {
    const r = calcularConfianza([signal({ signal: "AMOUNT_MATCH", tier: 2, matched: true, strength: "STRONG" })]);
    expect(r.wouldQualifyForAuto).toBe(false);
  });

  it("dos señales Tier 2 de la MISMA fuente no cuentan como independientes (UNIT_CODE_EXACT y NAME_SIMILARITY comparten `concept`)", () => {
    // Ninguna de las dos es Tier 2 en la práctica, pero el test verifica la
    // regla de agrupamiento por fuente en sí, no los tiers reales de esas señales.
    const r = calcularConfianza([
      signal({ signal: "UNIT_CODE_EXACT", tier: 2, matched: true, strength: "STRONG" }),
      signal({ signal: "NAME_SIMILARITY", tier: 2, matched: true, strength: "STRONG" }),
    ]);
    expect(r.wouldQualifyForAuto).toBe(false); // misma fuente (concept) — no cuenta doble
  });
});
