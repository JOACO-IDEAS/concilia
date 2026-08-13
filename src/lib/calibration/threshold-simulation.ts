// Fase 5.10 — simulación "what-if" de thresholds sobre casos históricos
// reales (Parte 8). SOLO LECTURA/ANÁLISIS: nunca modifica evidence-score.ts,
// deterministic-matcher.ts ni confidence-engine.ts (archivos protegidos,
// Parte 17) — recalcula, en memoria, qué habría pasado con un umbral
// alternativo aplicado sobre datos que el motor real YA calculó, y compara
// contra el ground truth humano ya vinculado. Nunca cambia ningún valor real.
//
// Dos simulaciones, ancladas en constantes reales confirmadas por lectura
// directa del código (no asumidas):
//  1) Umbral de score mínimo para considerar "motor positivo" — hoy el motor
//     no tiene ese umbral explícito (evidence-score.ts decide el estado de
//     forma estructural, no por corte numérico); esta simulación es una capa
//     hipotética de política sobre el score ya calculado, tal como pide la
//     Parte 8 ("threshold actual→80, alternativa→85...").
//  2) MARGEN_AMBIGUEDAD real = 10 (deterministic-matcher.ts:52, no exportado
//     — se referencia acá como constante documentada, no se importa).

import type { Tier } from "@/lib/reconciliation/types";
import type { CalibrationCase } from "./types";
import type { CategoriaConfusion } from "./types";
import { categorizarConfusion } from "./metrics";
import { MARGEN_AMBIGUEDAD_ACTUAL, PUNTOS_POR_TIER_ACTUAL } from "./config-snapshot";

// Fase 5.11 — reexportado desde config-snapshot.ts (fuente única de los
// parámetros reales del motor, ver ese archivo) para no romper callers/tests
// existentes de Fase 5.10 que importan esta constante desde acá.
export { MARGEN_AMBIGUEDAD_ACTUAL };

function categorizarSimulado(caso: CalibrationCase, motorPositivoSimulado: boolean): CategoriaConfusion {
  if (caso.groundTruth !== "HUMAN_CONFIRMED" && caso.groundTruth !== "HUMAN_REJECTED") return "NOT_CALIBRATABLE";
  if (caso.groundTruth === "HUMAN_CONFIRMED") return motorPositivoSimulado ? "TP" : "FN";
  return motorPositivoSimulado ? "FP" : "TN";
}

export interface CambioDeCategoria {
  paymentTransactionId: string;
  categoriaReal: CategoriaConfusion;
  categoriaSimulada: CategoriaConfusion;
}

export interface ResultadoUmbralDeScore {
  umbral: number;
  casosEvaluables: number; // calibrables (HUMAN_CONFIRMED/HUMAN_REJECTED) con engineScore no nulo
  matrizSimulada: { TP: number; FP: number; FN: number; TN: number; total: number };
  cambiosDeCategoria: CambioDeCategoria[]; // vs. el estado real del motor (motorEsPositivo(engineState))
}

/**
 * Para cada umbral candidato, simula "motor positivo" = engineScore >= umbral
 * (en vez de motorEsPositivo(engineState) real) y recalcula la matriz de
 * confusión. Solo usa casos con ground truth humano real Y engineScore no
 * nulo — nunca inventa un score para un caso que no lo tiene.
 */
export function simularUmbralesDeScore(casos: CalibrationCase[], umbrales: number[]): ResultadoUmbralDeScore[] {
  const evaluables = casos.filter((c) => (c.groundTruth === "HUMAN_CONFIRMED" || c.groundTruth === "HUMAN_REJECTED") && c.engineScore !== null);

  return umbrales.map((umbral) => {
    const matrizSimulada = { TP: 0, FP: 0, FN: 0, TN: 0, total: evaluables.length };
    const cambiosDeCategoria: CambioDeCategoria[] = [];

    for (const caso of evaluables) {
      const motorPositivoSimulado = (caso.engineScore as number) >= umbral;
      const categoriaSimulada = categorizarSimulado(caso, motorPositivoSimulado);
      if (categoriaSimulada !== "NOT_CALIBRATABLE") {
        matrizSimulada[categoriaSimulada] += 1;
      }
      const categoriaReal = categorizarConfusion(caso);
      if (categoriaReal !== categoriaSimulada) {
        cambiosDeCategoria.push({ paymentTransactionId: caso.paymentTransactionId, categoriaReal, categoriaSimulada });
      }
    }

    return { umbral, casosEvaluables: evaluables.length, matrizSimulada, cambiosDeCategoria };
  });
}

export interface DetalleMargenAmbiguedad {
  paymentTransactionId: string;
  diferenciaTopDos: number;
  esAmbiguoHoy: boolean; // con MARGEN_AMBIGUEDAD_ACTUAL=10
  esAmbiguoSimulado: boolean; // con el margen candidato
  cambia: boolean; // esAmbiguoHoy !== esAmbiguoSimulado — en cualquiera de los dos sentidos
  groundTruth: CalibrationCase["groundTruth"];
}

export interface ResultadoMargenAmbiguedad {
  margen: number;
  casosAplicables: number; // casos con >=2 topCandidates reales (única fuente con la que se puede calcular esta diferencia)
  casosQuePasanASerAmbiguos: number; // hoy CANDIDATE (no ambiguo) → simulado AMBIGUOUS
  casosQueDejanDeSerAmbiguos: number; // hoy AMBIGUOUS → simulado CANDIDATE (no ambiguo)
  detalle: DetalleMargenAmbiguedad[];
}

function diferenciaTopDosCandidatos(caso: CalibrationCase): number | null {
  const top = caso.structuredEvidence?.bank?.topCandidates;
  if (!top || top.length < 2) return null;
  const ordenados = [...top].sort((a, b) => b.score - a.score);
  return ordenados[0].score - ordenados[1].score;
}

/**
 * Para cada margen candidato, compara "¿sería ambiguo con este margen?"
 * (diferencia <= margen) contra "¿es ambiguo hoy?" (diferencia <=
 * MARGEN_AMBIGUEDAD_ACTUAL) — simétrico: reporta casos que pasarían a ser
 * ambiguos (margen más laxo) y casos que dejarían de serlo (margen más
 * estricto). Solo aplica a casos con al menos 2 topCandidates en
 * structuredEvidence — si no hay esa data, el caso queda fuera de la
 * simulación (nunca se inventa un ranking de candidatos que el motor real no
 * dejó registrado).
 */
export function simularMargenAmbiguedad(casos: CalibrationCase[], margenes: number[]): ResultadoMargenAmbiguedad[] {
  const conDiferencia = casos
    .map((c) => ({ caso: c, diferencia: diferenciaTopDosCandidatos(c) }))
    .filter((x): x is { caso: CalibrationCase; diferencia: number } => x.diferencia !== null);

  return margenes.map((margen) => {
    const detalle: DetalleMargenAmbiguedad[] = conDiferencia.map(({ caso, diferencia }) => {
      const esAmbiguoHoy = diferencia <= MARGEN_AMBIGUEDAD_ACTUAL;
      const esAmbiguoSimulado = diferencia <= margen;
      return {
        paymentTransactionId: caso.paymentTransactionId,
        diferenciaTopDos: diferencia,
        esAmbiguoHoy,
        esAmbiguoSimulado,
        cambia: esAmbiguoHoy !== esAmbiguoSimulado,
        groundTruth: caso.groundTruth,
      };
    });
    return {
      margen,
      casosAplicables: conDiferencia.length,
      casosQuePasanASerAmbiguos: detalle.filter((d) => !d.esAmbiguoHoy && d.esAmbiguoSimulado).length,
      casosQueDejanDeSerAmbiguos: detalle.filter((d) => d.esAmbiguoHoy && !d.esAmbiguoSimulado).length,
      detalle,
    };
  });
}

// --- Fase 5.11 — simulación de PUNTOS_POR_TIER (pesos por tier) ---
//
// A diferencia del umbral de score (§1 arriba) y MARGEN_AMBIGUEDAD (§2),
// PUNTOS_POR_TIER no determina directamente ningún estado de
// evidence-score.ts (que es estructural, no numérico) — solo alimenta el
// `score` mostrado y, en el motor real, `wouldQualifyForAuto`
// (confidence-engine.ts, informativo, sin efecto en ningún camino de
// escritura hoy). Por eso esta simulación es DESCRIPTIVA (score antes/
// después por caso) y NO produce una matriz TP/FP/FN/TN — hacerlo sería
// inventar una regla de binarización que el motor real no tiene. Documentado
// explícitamente como limitación en el informe final, no una omisión.

export interface CambioDeScorePorPesos {
  paymentTransactionId: string;
  scoreActual: number | null; // el ya calculado por el motor real (CalibrationCase.engineScore)
  scoreSimulado: number; // recalculado con los pesos propuestos, misma fórmula real (suma capada en 99)
  diferencia: number | null; // scoreSimulado - scoreActual, null si scoreActual es null (sin candidato)
}

export interface ResultadoPesosPorTier {
  pesosPropuestos: Record<Tier, number>;
  casosEvaluables: number; // con structuredEvidence.bank.signals disponible
  cambios: CambioDeScorePorPesos[];
}

/** Replica exacta de la fórmula real de confidence-engine.ts: `Math.min(99, señales matcheadas .reduce(suma + PUNTOS_POR_TIER[tier]))`. */
function recomputarScoreConPesos(signalsMatcheadas: { tier: Tier }[], pesos: Record<Tier, number>): number {
  if (signalsMatcheadas.length === 0) return 0;
  return Math.min(99, signalsMatcheadas.reduce((suma, s) => suma + (pesos[s.tier] ?? 0), 0));
}

/**
 * Recalcula, por caso, qué score habría dado el motor con pesos por tier
 * alternativos — sobre las mismas señales reales ya matcheadas
 * (`structuredEvidence.bank.signals`), nunca inventadas. Solo aplica a casos
 * con ground truth humano real Y `structuredEvidence.bank.signals`
 * disponible — si no hay ese dato, el caso queda fuera (mismo criterio que
 * las otras 2 simulaciones de este archivo).
 */
export function simularPesosPorTier(casos: CalibrationCase[], pesosPropuestos: Record<Tier, number> = PUNTOS_POR_TIER_ACTUAL): ResultadoPesosPorTier {
  const evaluables = casos.filter(
    (c) => (c.groundTruth === "HUMAN_CONFIRMED" || c.groundTruth === "HUMAN_REJECTED") && c.structuredEvidence?.bank?.signals
  );

  const cambios: CambioDeScorePorPesos[] = evaluables.map((c) => {
    const matcheadas = (c.structuredEvidence?.bank?.signals ?? []).filter((s) => s.matched);
    const scoreSimulado = recomputarScoreConPesos(matcheadas, pesosPropuestos);
    return {
      paymentTransactionId: c.paymentTransactionId,
      scoreActual: c.engineScore,
      scoreSimulado,
      diferencia: c.engineScore === null ? null : scoreSimulado - c.engineScore,
    };
  });

  return { pesosPropuestos, casosEvaluables: evaluables.length, cambios };
}
