import { describe, expect, it } from "vitest";
import { calcularMetricas, formatearResultadoShadow } from "./observability";
import type { ShadowMatchResult } from "./types";

function resultado(overrides: Partial<ShadowMatchResult> = {}): ShadowMatchResult {
  return {
    paymentTransactionId: "pt-1",
    candidateUnitId: null,
    candidateUnitOwnerId: null,
    candidateObligationId: null,
    score: 0,
    tier: null,
    status: "BLOCKED",
    signals: [],
    blockers: [],
    explanation: "",
    engineVersion: "3.4.0",
    evaluatedAt: "2026-08-08T12:00:00.000Z",
    topCandidateScore: null,
    topCandidateTier: null,
    topCandidates: null,
    ...overrides,
  };
}

// Caso #12: la explicación mostrada coincide EXACTAMENTE con la ya
// calculada por el motor — observability.ts nunca la reconstruye ni la
// altera, solo la muestra.
describe("formatearResultadoShadow — la explicación coincide con las señales (#12)", () => {
  it("reproduce la explicación tal cual viene en el resultado, sin alterarla", () => {
    const r = resultado({
      status: "CANDIDATE",
      score: 94,
      explanation: "✓ CUIT coincide\n✓ UF 3A coincide\n⚠ Fecha compatible",
    });
    const texto = formatearResultadoShadow(r, null, "#123");

    expect(texto).toContain("✓ CUIT coincide\n✓ UF 3A coincide\n⚠ Fecha compatible");
    expect(texto).toContain("Pago #123");
    expect(texto).toContain("Confianza: 94%");
    expect(texto).toContain("Estado: CANDIDATE");
  });

  it("muestra 'Bloqueos: ninguno' cuando no hay bloqueos, o los lista cuando sí hay", () => {
    const sinBloqueos = formatearResultadoShadow(resultado({ blockers: [] }), null);
    expect(sinBloqueos).toContain("Bloqueos: ninguno");

    const conBloqueos = formatearResultadoShadow(
      resultado({ blockers: [{ type: "CUIT_CONTRADICTORY", evidence: "El CUIT pertenece a otro titular." }] }),
      null
    );
    expect(conBloqueos).toContain("El CUIT pertenece a otro titular.");
  });

  it("incluye el candidato (UF / titular / obligación / saldo) cuando se provee el contexto", () => {
    const texto = formatearResultadoShadow(resultado({ status: "CANDIDATE" }), {
      unitCode: "3A",
      ownerFullName: "Juan Pérez",
      obligationPeriod: "2026-08",
      obligationSaldo: 145000,
    });

    expect(texto).toContain("UF 3A");
    expect(texto).toContain("Titular: Juan Pérez");
    expect(texto).toContain("Obligación: 2026-08");
    expect(texto).toContain("Saldo: $145000");
  });

  it("muestra la versión del motor que produjo el resultado", () => {
    const texto = formatearResultadoShadow(resultado({ engineVersion: "3.4.0" }), null);
    expect(texto).toContain("Motor: 3.4.0");
  });
});

describe("calcularMetricas", () => {
  it("cuenta por status, señales y bloqueos frecuentes", () => {
    const registros: ShadowMatchResult[] = [
      resultado({
        status: "CANDIDATE",
        score: 95,
        tier: 1,
        signals: [{ signal: "CUIT_EXACT", tier: 1, matched: true, strength: "STRONG", evidence: "x" }],
      }),
      resultado({
        status: "BLOCKED",
        score: 0,
        blockers: [{ type: "INSUFFICIENT_EVIDENCE", evidence: "x" }],
      }),
      resultado({
        status: "AMBIGUOUS",
        score: 40,
        tier: 3,
        blockers: [{ type: "MULTIPLE_EQUIVALENT_CANDIDATES", evidence: "x" }],
      }),
    ];

    const m = calcularMetricas(registros);

    expect(m.totalEvaluados).toBe(3);
    expect(m.porStatus).toEqual({ CANDIDATE: 1, AMBIGUOUS: 1, BLOCKED: 1 });
    expect(m.sinEvidencia).toBe(1);
    expect(m.senalesFrecuentes.CUIT_EXACT).toBe(1);
    expect(m.bloqueosFrecuentes.INSUFFICIENT_EVIDENCE).toBe(1);
    expect(m.bloqueosFrecuentes.MULTIPLE_EQUIVALENT_CANDIDATES).toBe(1);
    expect(m.distribucionTier["1"]).toBe(1);
    expect(m.distribucionTier.sin_tier).toBe(1);
    // Fase 3.5: confianza promedio y conteo por engineVersion.
    expect(m.confianzaPromedio).toBeCloseTo((95 + 0 + 40) / 3);
    expect(m.porEngineVersion["3.4.0"]).toBe(3);
  });

  it("con cero registros devuelve métricas vacías, sin lanzar", () => {
    const m = calcularMetricas([]);
    expect(m.totalEvaluados).toBe(0);
    expect(m.porStatus).toEqual({ CANDIDATE: 0, AMBIGUOUS: 0, BLOCKED: 0 });
    expect(m.confianzaPromedio).toBe(0);
    expect(m.porEngineVersion).toEqual({});
    expect(m.distribucionTopCandidateScoreBlocked).toEqual([]);
    expect(m.blockedSinCandidatoEvaluado).toBe(0);
  });

  // Fase 3.9 — responde exactamente la pregunta que motivó el campo:
  // "¿cuántos BLOCKED tenían igual un candidato con score 90+?"
  it("distribucionTopCandidateScoreBlocked / blockedSinCandidatoEvaluado — solo cuentan BLOCKED, separando 'score 0 real' de 'sin candidato'", () => {
    const registros: ShadowMatchResult[] = [
      resultado({ status: "BLOCKED", score: 0, topCandidateScore: 92, topCandidateTier: 1 }), // bloqueado con evidencia fuerte
      resultado({ status: "BLOCKED", score: 0, topCandidateScore: 0, topCandidateTier: null }), // bloqueado sin ninguna señal
      resultado({ status: "BLOCKED", score: 0, topCandidateScore: null, topCandidateTier: null }), // NO_UNITS_IN_ORGANIZATION — ni un candidato
      resultado({ status: "CANDIDATE", score: 95, topCandidateScore: 95, topCandidateTier: 1 }), // no debe contarse acá — no es BLOCKED
    ];

    const m = calcularMetricas(registros);

    expect(m.blockedSinCandidatoEvaluado).toBe(1);
    const bucket90 = m.distribucionTopCandidateScoreBlocked.find((d) => d.rango === "90-99");
    expect(bucket90?.cantidad).toBe(1);
    const bucket0 = m.distribucionTopCandidateScoreBlocked.find((d) => d.rango === "0-9");
    expect(bucket0?.cantidad).toBe(1);
    // Total de buckets = 2 BLOCKED con candidato real (92 y 0) — el CANDIDATE y el "sin candidato" no entran acá.
    const totalEnBuckets = m.distribucionTopCandidateScoreBlocked.reduce((acc, d) => acc + d.cantidad, 0);
    expect(totalEnBuckets).toBe(2);
  });
});
