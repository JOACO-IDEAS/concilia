// Fase 5.11 — capa de RECOMENDACIÓN de calibración. Consume ÚNICAMENTE
// módulos ya construidos y puros (pattern-mining.ts, threshold-simulation.ts,
// config-snapshot.ts, metrics.ts) — nunca Prisma, nunca escribe, nunca
// decide. Toda "recomendación" es un objeto de datos auditable: qué patrón
// detectó, cuántos casos lo sustentan (separados ORGANIC/SYNTHETIC_DEMO,
// Regla 3), qué threshold real impacta, qué cambio propone, qué casos
// pasarían/no pasarían, qué regresiones introduce, y su nivel de confianza —
// NUNCA se aplica. "GO" de una recomendación significa "documentada y lista
// para que un humano decida", nunca "aplicada" (Regla 4/6 de esta fase).
//
// Regla de confianza (Regla 3 — nunca mezclar ORGANIC/SYNTHETIC_DEMO sin
// etiquetar): el nivel de confianza de CUALQUIER recomendación se calcula
// EXCLUSIVAMENTE sobre la muestra ORGANIC — un caso SYNTHETIC_DEMO puede
// aparecer en los conteos totales/descripciones (siempre etiquetado como
// tal), pero jamás sube el nivel de confianza de "insuficiente".

import type { Tier } from "@/lib/reconciliation/types";
import type { CalibrationCase, CategoriaConfusion } from "./types";
import { UMBRAL_MINIMO_MUESTRA_DEFAULT, categorizarConfusion } from "./metrics";
import { minarPatrones, type OrigenDeMuestra, type PatronDeCalibracion } from "./pattern-mining";
import {
  MARGEN_AMBIGUEDAD_ACTUAL,
  simularMargenAmbiguedad,
  simularPesosPorTier,
  simularUmbralesDeScore,
  type ResultadoMargenAmbiguedad,
  type ResultadoPesosPorTier,
  type ResultadoUmbralDeScore,
} from "./threshold-simulation";
import { CONFIGURACION_ACTUAL, PUNTOS_POR_TIER_ACTUAL, type ConfiguracionDelMotor } from "./config-snapshot";

export type NivelDeConfianza = "insuficiente" | "baja" | "media" | "alta";

/** Solo la muestra ORGANIC cuenta — ver comentario de cabecera. */
export function calcularNivelDeConfianza(muestraOrganic: number, umbralMinimoMuestra: number = UMBRAL_MINIMO_MUESTRA_DEFAULT): NivelDeConfianza {
  if (muestraOrganic <= 0) return "insuficiente";
  if (muestraOrganic < umbralMinimoMuestra) return "baja";
  if (muestraOrganic < umbralMinimoMuestra * 2) return "media";
  return "alta";
}

function contarOrigenDeMuestra(casos: CalibrationCase[]): OrigenDeMuestra {
  return {
    organic: casos.filter((c) => c.humanDecisionProvenance === "ORGANIC").length,
    syntheticDemo: casos.filter((c) => c.humanDecisionProvenance === "SYNTHETIC_DEMO").length,
  };
}

function esCategoriaCorrecta(cat: CategoriaConfusion): boolean {
  return cat === "TP" || cat === "TN";
}

/** De una lista de cambios de categoría, separa cuáles son mejoras (incorrecta→correcta) y cuáles regresiones (correcta→incorrecta) — nunca se etiquetan al revés. */
function clasificarMejorasYRegresiones(cambios: { paymentTransactionId: string; categoriaReal: CategoriaConfusion; categoriaSimulada: CategoriaConfusion }[]): {
  mejoras: string[];
  regresiones: string[];
} {
  const mejoras: string[] = [];
  const regresiones: string[] = [];
  for (const c of cambios) {
    const eraCorrecta = esCategoriaCorrecta(c.categoriaReal);
    const esCorrectaAhora = esCategoriaCorrecta(c.categoriaSimulada);
    if (!eraCorrecta && esCorrectaAhora) mejoras.push(c.paymentTransactionId);
    else if (eraCorrecta && !esCorrectaAhora) regresiones.push(c.paymentTransactionId);
  }
  return { mejoras, regresiones };
}

function variacionPorcentual(antes: number, despues: number): number | null {
  if (antes === 0) return despues === 0 ? 0 : null; // división por cero real — no se inventa un porcentaje
  return ((despues - antes) / antes) * 100;
}

// --- Patrones (Parte 7) ---

export interface RecomendacionDePatron {
  tipo: "PATTERN";
  patron: PatronDeCalibracion;
  nivelDeConfianza: NivelDeConfianza;
  descripcionAuditable: string;
}

function describirPatron(patron: PatronDeCalibracion, umbralMinimoMuestra: number): string {
  const { organic, syntheticDemo } = patron.origenDeMuestra;
  const nombrePatron = patron.tipo === "SIGNAL_COMBINATION" ? `aparecen ${patron.firma.join(" + ") || "(sin señales coincidentes)"}` : `convergen ${patron.firma.join(" + ") || "(ninguna familia)"}`;
  const nivelDeConfianza = calcularNivelDeConfianza(organic, umbralMinimoMuestra);
  const sufijoSintetico = syntheticDemo > 0 ? ` + ${syntheticDemo} caso(s) SYNTHETIC_DEMO (excluidos del cálculo de confianza, incluidos en el conteo total)` : "";
  return `En ${organic} caso(s) ORGANIC${sufijoSintetico} donde ${nombrePatron}, los administradores aprobaron ${patron.aprobados}/${patron.totalCasos} casos totales (${Math.round(patron.tasaAprobacion * 100)}%). Confianza: ${nivelDeConfianza}${nivelDeConfianza === "insuficiente" ? " — sin ningún caso ORGANIC, no generalizable" : ""}.`;
}

/** Envuelve pattern-mining.ts en recomendaciones auditables — nunca filtra los no confiables, los etiqueta. */
export function generarRecomendacionesDePatrones(casos: CalibrationCase[], umbralMinimoMuestra: number = UMBRAL_MINIMO_MUESTRA_DEFAULT): RecomendacionDePatron[] {
  return minarPatrones(casos, umbralMinimoMuestra).map((patron) => ({
    tipo: "PATTERN",
    patron,
    nivelDeConfianza: calcularNivelDeConfianza(patron.origenDeMuestra.organic, umbralMinimoMuestra),
    descripcionAuditable: describirPatron(patron, umbralMinimoMuestra),
  }));
}

// --- Umbral de score (Parte 8, capa hipotética de política — ver threshold-simulation.ts) ---

export interface RecomendacionDeUmbralDeScore {
  tipo: "SCORE_THRESHOLD_SIMULATION";
  valorActual: null; // no existe un corte numérico real en evidence-score.ts — ver threshold-simulation.ts cabecera
  valorPropuesto: number;
  resultado: ResultadoUmbralDeScore;
  matrizAntes: { TP: number; FP: number; FN: number; TN: number; total: number };
  variacionPorcentualFP: number | null;
  variacionPorcentualFN: number | null;
  mejoras: string[];
  regresiones: string[];
  origenDeMuestra: OrigenDeMuestra;
  nivelDeConfianza: NivelDeConfianza;
}

export function generarRecomendacionesDeUmbralDeScore(
  casos: CalibrationCase[],
  umbrales: number[],
  umbralMinimoMuestra: number = UMBRAL_MINIMO_MUESTRA_DEFAULT
): RecomendacionDeUmbralDeScore[] {
  const evaluables = casos.filter((c) => (c.groundTruth === "HUMAN_CONFIRMED" || c.groundTruth === "HUMAN_REJECTED") && c.engineScore !== null);
  const categoriasReales = evaluables.map(categorizarConfusion);
  const matrizAntes = {
    TP: categoriasReales.filter((c) => c === "TP").length,
    FP: categoriasReales.filter((c) => c === "FP").length,
    FN: categoriasReales.filter((c) => c === "FN").length,
    TN: categoriasReales.filter((c) => c === "TN").length,
    total: evaluables.length,
  };
  const origenDeMuestra = contarOrigenDeMuestra(evaluables);
  const nivelDeConfianza = calcularNivelDeConfianza(evaluables.filter((c) => c.humanDecisionProvenance === "ORGANIC").length, umbralMinimoMuestra);

  return simularUmbralesDeScore(casos, umbrales).map((resultado) => {
    const { mejoras, regresiones } = clasificarMejorasYRegresiones(resultado.cambiosDeCategoria);
    return {
      tipo: "SCORE_THRESHOLD_SIMULATION",
      valorActual: null,
      valorPropuesto: resultado.umbral,
      resultado,
      matrizAntes,
      variacionPorcentualFP: variacionPorcentual(matrizAntes.FP, resultado.matrizSimulada.FP),
      variacionPorcentualFN: variacionPorcentual(matrizAntes.FN, resultado.matrizSimulada.FN),
      mejoras,
      regresiones,
      origenDeMuestra,
      nivelDeConfianza,
    };
  });
}

// --- Margen de ambigüedad (parámetro real, deterministic-matcher.ts:52) ---

export interface RecomendacionDeMargenAmbiguedad {
  tipo: "MARGIN_SIMULATION";
  valorActual: number;
  valorPropuesto: number;
  resultado: ResultadoMargenAmbiguedad;
  origenDeMuestra: OrigenDeMuestra;
  nivelDeConfianza: NivelDeConfianza;
}

export function generarRecomendacionesDeMargenAmbiguedad(
  casos: CalibrationCase[],
  margenes: number[],
  umbralMinimoMuestra: number = UMBRAL_MINIMO_MUESTRA_DEFAULT
): RecomendacionDeMargenAmbiguedad[] {
  return simularMargenAmbiguedad(casos, margenes).map((resultado) => {
    const casosAplicablesIds = new Set(resultado.detalle.map((d) => d.paymentTransactionId));
    const casosAplicables = casos.filter((c) => casosAplicablesIds.has(c.paymentTransactionId));
    return {
      tipo: "MARGIN_SIMULATION",
      valorActual: MARGEN_AMBIGUEDAD_ACTUAL,
      valorPropuesto: resultado.margen,
      resultado,
      origenDeMuestra: contarOrigenDeMuestra(casosAplicables),
      nivelDeConfianza: calcularNivelDeConfianza(casosAplicables.filter((c) => c.humanDecisionProvenance === "ORGANIC").length, umbralMinimoMuestra),
    };
  });
}

// --- Pesos por tier (parámetro real, confidence-engine.ts:14 — descriptivo, ver threshold-simulation.ts) ---

export interface RecomendacionDePesosPorTier {
  tipo: "WEIGHT_SIMULATION";
  valorActual: Record<Tier, number>;
  valorPropuesto: Record<Tier, number>;
  resultado: ResultadoPesosPorTier;
  origenDeMuestra: OrigenDeMuestra;
  nivelDeConfianza: NivelDeConfianza;
  limitacion: string;
}

const LIMITACION_PESOS =
  "PUNTOS_POR_TIER no determina directamente ningún estado de evidence-score.ts (estructural, no numérico) — esta simulación es descriptiva (score antes/después), no produce una matriz TP/FP/FN/TN. Ver threshold-simulation.ts.";

export function generarRecomendacionDePesosPorTier(
  casos: CalibrationCase[],
  pesosPropuestos: Record<Tier, number>,
  umbralMinimoMuestra: number = UMBRAL_MINIMO_MUESTRA_DEFAULT
): RecomendacionDePesosPorTier {
  const resultado = simularPesosPorTier(casos, pesosPropuestos);
  const idsEvaluables = new Set(resultado.cambios.map((c) => c.paymentTransactionId));
  const evaluables = casos.filter((c) => idsEvaluables.has(c.paymentTransactionId));
  return {
    tipo: "WEIGHT_SIMULATION",
    valorActual: PUNTOS_POR_TIER_ACTUAL,
    valorPropuesto: pesosPropuestos,
    resultado,
    origenDeMuestra: contarOrigenDeMuestra(evaluables),
    nivelDeConfianza: calcularNivelDeConfianza(evaluables.filter((c) => c.humanDecisionProvenance === "ORGANIC").length, umbralMinimoMuestra),
    limitacion: LIMITACION_PESOS,
  };
}

// --- Bundle completo ---

export interface RecomendacionesDeCalibracion {
  patrones: RecomendacionDePatron[];
  umbralesDeScore: RecomendacionDeUmbralDeScore[];
  margenesDeAmbiguedad: RecomendacionDeMargenAmbiguedad[];
  umbralMinimoMuestra: number;
}

export interface OpcionesDeRecomendacion {
  umbralMinimoMuestra?: number;
  umbralesDeScoreASimular?: number[];
  margenesASimular?: number[];
}

const UMBRALES_DE_SCORE_DEFAULT = [50, 60, 70, 80, 90];
const MARGENES_DEFAULT = [5, 10, 15, 20];

/** Punto de entrada único — genera TODAS las recomendaciones auditables sobre un dataset ya cargado. Nunca aplica nada. */
export function generarRecomendacionesDeCalibracion(casos: CalibrationCase[], opciones: OpcionesDeRecomendacion = {}): RecomendacionesDeCalibracion {
  const umbralMinimoMuestra = opciones.umbralMinimoMuestra ?? UMBRAL_MINIMO_MUESTRA_DEFAULT;
  return {
    patrones: generarRecomendacionesDePatrones(casos, umbralMinimoMuestra),
    umbralesDeScore: generarRecomendacionesDeUmbralDeScore(casos, opciones.umbralesDeScoreASimular ?? UMBRALES_DE_SCORE_DEFAULT, umbralMinimoMuestra),
    margenesDeAmbiguedad: generarRecomendacionesDeMargenAmbiguedad(casos, opciones.margenesASimular ?? MARGENES_DEFAULT, umbralMinimoMuestra),
    umbralMinimoMuestra,
  };
}

// --- CURRENT CONFIG vs PROPOSED CONFIG ---

export interface PropuestaDeConfiguracion {
  marginAmbiguedad?: number;
  puntosPorTier?: Record<Tier, number>;
}

export interface CambioDeParametro {
  parametro: keyof ConfiguracionDelMotor;
  valorActual: unknown;
  valorPropuesto: unknown;
}

export interface ComparacionDeConfiguracion {
  actual: ConfiguracionDelMotor;
  propuesta: PropuestaDeConfiguracion;
  cambios: CambioDeParametro[];
  margenAmbiguedad: RecomendacionDeMargenAmbiguedad | null;
  pesosPorTier: RecomendacionDePesosPorTier | null;
}

/**
 * Comparación explícita CURRENT CONFIG vs. PROPOSED CONFIG (pedido
 * explícito de esta fase) — solo sobre parámetros REALES
 * (`marginAmbiguedad`/`puntosPorTier`, ver config-snapshot.ts). Nunca aplica
 * la propuesta — devuelve el diagnóstico completo para que un humano decida.
 */
export function compararConfiguraciones(
  casos: CalibrationCase[],
  propuesta: PropuestaDeConfiguracion,
  umbralMinimoMuestra: number = UMBRAL_MINIMO_MUESTRA_DEFAULT
): ComparacionDeConfiguracion {
  const cambios: CambioDeParametro[] = [];
  let margenAmbiguedad: RecomendacionDeMargenAmbiguedad | null = null;
  let pesosPorTier: RecomendacionDePesosPorTier | null = null;

  if (propuesta.marginAmbiguedad !== undefined) {
    cambios.push({ parametro: "marginAmbiguedad", valorActual: CONFIGURACION_ACTUAL.marginAmbiguedad, valorPropuesto: propuesta.marginAmbiguedad });
    [margenAmbiguedad] = generarRecomendacionesDeMargenAmbiguedad(casos, [propuesta.marginAmbiguedad], umbralMinimoMuestra);
  }
  if (propuesta.puntosPorTier !== undefined) {
    cambios.push({ parametro: "puntosPorTier", valorActual: CONFIGURACION_ACTUAL.puntosPorTier, valorPropuesto: propuesta.puntosPorTier });
    pesosPorTier = generarRecomendacionDePesosPorTier(casos, propuesta.puntosPorTier, umbralMinimoMuestra);
  }

  return { actual: CONFIGURACION_ACTUAL, propuesta, cambios, margenAmbiguedad, pesosPorTier };
}
