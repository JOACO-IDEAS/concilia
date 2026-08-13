// Fase 5.10 — métricas descriptivas + matriz de confusión sobre el dataset
// de calibración. Función PURA. Nunca inventa accuracy: cualquier métrica
// derivada de una muestra chica queda marcada `confiable:false` en vez de
// presentarse como un número sólido — pedido explícito de esta fase.

import type { EvidenceFamilyName, PaymentEvidenceState } from "@/lib/payment-evidence/evidence-score";
import type { CalibrationCase, CategoriaConfusion } from "./types";
import { motorEsPositivo } from "./types";

export const UMBRAL_MINIMO_MUESTRA_DEFAULT = 5;

export interface ValorConMuestra<T> {
  valor: T;
  muestra: number;
  confiable: boolean;
}

function conMuestra<T>(valor: T, muestra: number, umbral: number): ValorConMuestra<T> {
  return { valor, muestra, confiable: muestra >= umbral };
}

export interface ConteoConMuestra {
  clave: string;
  cantidad: number;
}

export interface MatrizDeConfusion {
  TP: number;
  FP: number;
  FN: number;
  TN: number;
  NOT_CALIBRATABLE: number;
  total: number;
}

export interface MetricasDeCalibracion {
  totalCasos: number;
  casosOrigenReal: number;
  casosOrigenSintetico: number;
  casosConDecisionHumana: number; // HUMAN_CONFIRMED + HUMAN_REJECTED
  casosSinDecision: number; // INSUFFICIENT_DATA
  casosNoVinculables: number; // UNRESOLVED
  aprobadosPorHumano: number;
  rechazadosPorHumano: number;
  matrizDeConfusion: MatrizDeConfusion;
  distribucionPorEstado: ConteoConMuestra[];
  distribucionPorTier: ConteoConMuestra[];
  distribucionPorScoreBucket: ConteoConMuestra[]; // buckets de a 20 puntos
  distribucionPorFamiliaConvergente: ConteoConMuestra[];
  bloqueosMasFrecuentes: ConteoConMuestra[];
  señalesMasFrecuentesEnAprobados: ConteoConMuestra[];
  señalesMasFrecuentesEnRechazados: ConteoConMuestra[];
  precisionAproximada: ValorConMuestra<number | null>;
  recallAproximado: ValorConMuestra<number | null>;
  falsePositiveRate: ValorConMuestra<number | null>;
  falseNegativeRate: ValorConMuestra<number | null>;
  umbralMinimoMuestra: number;
}

/** Compartida con disagreement.ts — la matriz de confusión y el análisis de desacuerdos usan exactamente la misma regla de categorización. */
export function categorizarConfusion(c: CalibrationCase): CategoriaConfusion {
  if (c.groundTruth !== "HUMAN_CONFIRMED" && c.groundTruth !== "HUMAN_REJECTED") return "NOT_CALIBRATABLE";
  const positivo = motorEsPositivo(c.engineState);
  if (c.groundTruth === "HUMAN_CONFIRMED") return positivo ? "TP" : "FN";
  return positivo ? "FP" : "TN"; // HUMAN_REJECTED
}

function contarPorClave(items: string[]): ConteoConMuestra[] {
  const mapa = new Map<string, number>();
  for (const i of items) mapa.set(i, (mapa.get(i) ?? 0) + 1);
  return [...mapa.entries()].map(([clave, cantidad]) => ({ clave, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
}

function bucketDeScore(score: number | null): string {
  if (score === null) return "sin-score";
  const piso = Math.floor(score / 20) * 20;
  return `${piso}-${piso + 19}`;
}

export function calcularMetricasDeCalibracion(casos: CalibrationCase[], umbralMinimoMuestra: number = UMBRAL_MINIMO_MUESTRA_DEFAULT): MetricasDeCalibracion {
  const confirmados = casos.filter((c) => c.groundTruth === "HUMAN_CONFIRMED");
  const rechazados = casos.filter((c) => c.groundTruth === "HUMAN_REJECTED");
  const sinDecision = casos.filter((c) => c.groundTruth === "INSUFFICIENT_DATA");
  const noVinculables = casos.filter((c) => c.groundTruth === "UNRESOLVED");

  const categorias = casos.map(categorizarConfusion);
  const matrizDeConfusion: MatrizDeConfusion = {
    TP: categorias.filter((c) => c === "TP").length,
    FP: categorias.filter((c) => c === "FP").length,
    FN: categorias.filter((c) => c === "FN").length,
    TN: categorias.filter((c) => c === "TN").length,
    NOT_CALIBRATABLE: categorias.filter((c) => c === "NOT_CALIBRATABLE").length,
    total: casos.length,
  };
  const { TP, FP, FN, TN } = matrizDeConfusion;

  const aprobadosConSignals = confirmados.flatMap((c) => c.structuredEvidence?.bank?.signals.filter((s) => s.matched).map((s) => s.signal) ?? []);
  const rechazadosConSignals = rechazados.flatMap((c) => c.structuredEvidence?.bank?.signals.filter((s) => s.matched).map((s) => s.signal) ?? []);
  const bloqueos = casos.flatMap((c) => c.structuredEvidence?.bank?.blockers.map((b) => b.type) ?? []);

  return {
    totalCasos: casos.length,
    casosOrigenReal: casos.filter((c) => c.origin === "REAL").length,
    casosOrigenSintetico: casos.filter((c) => c.origin === "SYNTHETIC").length,
    casosConDecisionHumana: confirmados.length + rechazados.length,
    casosSinDecision: sinDecision.length,
    casosNoVinculables: noVinculables.length,
    aprobadosPorHumano: confirmados.length,
    rechazadosPorHumano: rechazados.length,
    matrizDeConfusion,
    distribucionPorEstado: contarPorClave(casos.map((c) => c.engineState as PaymentEvidenceState)),
    distribucionPorTier: contarPorClave(casos.map((c) => (c.tier === null ? "sin-tier" : `tier-${c.tier}`))),
    distribucionPorScoreBucket: contarPorClave(casos.map((c) => bucketDeScore(c.engineScore))),
    distribucionPorFamiliaConvergente: contarPorClave(casos.flatMap((c) => (c.independentFamiliesConverging.length > 0 ? c.independentFamiliesConverging : (["ninguna"] as EvidenceFamilyName[] | string[]) as string[]))),
    bloqueosMasFrecuentes: contarPorClave(bloqueos),
    señalesMasFrecuentesEnAprobados: contarPorClave(aprobadosConSignals),
    señalesMasFrecuentesEnRechazados: contarPorClave(rechazadosConSignals),
    precisionAproximada: conMuestra(TP + FP > 0 ? TP / (TP + FP) : null, TP + FP, umbralMinimoMuestra),
    recallAproximado: conMuestra(TP + FN > 0 ? TP / (TP + FN) : null, TP + FN, umbralMinimoMuestra),
    falsePositiveRate: conMuestra(FP + TN > 0 ? FP / (FP + TN) : null, FP + TN, umbralMinimoMuestra),
    falseNegativeRate: conMuestra(FN + TP > 0 ? FN / (FN + TP) : null, FN + TP, umbralMinimoMuestra),
    umbralMinimoMuestra,
  };
}
