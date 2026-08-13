// Fase 5.11 — "¿Qué decisiones humanas repetidas podría aprender ConcilIA
// para dejar de pedirle intervención al administrador?" SOLO DETECCIÓN — no
// implementa ninguna automatización, no produce ningún camino de AUTO. Cada
// dimensión reporta cantidad de casos, decisiones concordantes, excepciones,
// confianza (SOLO sobre muestra ORGANIC, Regla 3), riesgo de automatizar, y
// si la dimensión no es medible con los datos que existen hoy, lo dice
// explícitamente — nunca fabrica una métrica sobre un dato que no está.

import type { CalibrationCase } from "./types";
import { UMBRAL_MINIMO_MUESTRA_DEFAULT } from "./metrics";
import { calcularNivelDeConfianza, type NivelDeConfianza } from "./recommendation";
import type { OrigenDeMuestra } from "./pattern-mining";

export type TipoDePatronDeAutomatizacion =
  | "SAME_EVIDENCE_SAME_DECISION"
  | "SAME_REJECTION_REASON"
  | "SAME_CONTRADICTION_TYPE"
  | "SAME_FAMILY_COMBINATION"
  | "SAME_SCORE_RANGE"
  | "SAME_UNIT_OR_OBLIGATION_TYPE"
  | "SAME_TEMPORAL_PATTERN"
  | "SAME_ORGANIZATION_BEHAVIOR";

export type RiesgoDeAutomatizar = "bajo" | "medio" | "alto" | "no_evaluable";

export interface CandidatoDeAutomatizacion {
  tipo: TipoDePatronDeAutomatizacion;
  clave: string; // identifica el grupo puntual dentro de la dimensión (ej. la firma de señales, o el texto de rechazo)
  medible: boolean;
  razonNoMedible: string | null;
  datoAdicionalNecesario: string | null;
  descripcion: string;
  totalCasos: number;
  decisionesConcordantes: number; // veces que se repitió la decisión mayoritaria del grupo
  excepciones: number; // casos del grupo que NO siguieron la decisión mayoritaria
  origenDeMuestra: OrigenDeMuestra;
  confianzaEstadistica: NivelDeConfianza;
  riesgoDeAutomatizar: RiesgoDeAutomatizar;
}

function contarOrigenDeMuestra(casos: CalibrationCase[]): OrigenDeMuestra {
  return {
    organic: casos.filter((c) => c.humanDecisionProvenance === "ORGANIC").length,
    syntheticDemo: casos.filter((c) => c.humanDecisionProvenance === "SYNTHETIC_DEMO").length,
  };
}

/**
 * Riesgo conservador por diseño (misma postura que el resto de esta fase:
 * "preferible 5 pagos esperando revisión que uno mal automatizado"): "bajo"
 * exige CERO excepciones Y confianza "alta"; cualquier excepción, sin
 * importar cuán chica, sube el riesgo a "alto" — un patrón que ya falló una
 * vez en la muestra conocida no es candidato de automatización todavía.
 */
function calcularRiesgo(excepciones: number, confianza: NivelDeConfianza): RiesgoDeAutomatizar {
  if (confianza === "insuficiente") return "no_evaluable";
  if (excepciones > 0) return "alto";
  if (confianza === "alta") return "bajo";
  return "medio";
}

function construirCandidato(
  tipo: TipoDePatronDeAutomatizacion,
  clave: string,
  casosDelGrupo: CalibrationCase[],
  descripcion: string,
  umbralMinimoMuestra: number
): CandidatoDeAutomatizacion {
  const aprobados = casosDelGrupo.filter((c) => c.groundTruth === "HUMAN_CONFIRMED").length;
  const rechazados = casosDelGrupo.length - aprobados;
  const decisionesConcordantes = Math.max(aprobados, rechazados);
  const excepciones = casosDelGrupo.length - decisionesConcordantes;
  const origenDeMuestra = contarOrigenDeMuestra(casosDelGrupo);
  const confianzaEstadistica = calcularNivelDeConfianza(origenDeMuestra.organic, umbralMinimoMuestra);
  return {
    tipo,
    clave,
    medible: true,
    razonNoMedible: null,
    datoAdicionalNecesario: null,
    descripcion,
    totalCasos: casosDelGrupo.length,
    decisionesConcordantes,
    excepciones,
    origenDeMuestra,
    confianzaEstadistica,
    riesgoDeAutomatizar: calcularRiesgo(excepciones, confianzaEstadistica),
  };
}

function noMedible(tipo: TipoDePatronDeAutomatizacion, razonNoMedible: string, datoAdicionalNecesario: string): CandidatoDeAutomatizacion {
  return {
    tipo,
    clave: "(no medible)",
    medible: false,
    razonNoMedible,
    datoAdicionalNecesario,
    descripcion: `Dimensión "${tipo}" no medible hoy: ${razonNoMedible}`,
    totalCasos: 0,
    decisionesConcordantes: 0,
    excepciones: 0,
    origenDeMuestra: { organic: 0, syntheticDemo: 0 },
    confianzaEstadistica: "insuficiente",
    riesgoDeAutomatizar: "no_evaluable",
  };
}

function calibrables(casos: CalibrationCase[]): CalibrationCase[] {
  return casos.filter((c) => c.groundTruth === "HUMAN_CONFIRMED" || c.groundTruth === "HUMAN_REJECTED");
}

function agruparPorClave(casos: CalibrationCase[], claveDe: (c: CalibrationCase) => string | null): Map<string, CalibrationCase[]> {
  const mapa = new Map<string, CalibrationCase[]>();
  for (const c of casos) {
    const clave = claveDe(c);
    if (clave === null) continue;
    const grupo = mapa.get(clave) ?? [];
    grupo.push(c);
    mapa.set(clave, grupo);
  }
  return mapa;
}

// --- SAME_EVIDENCE_SAME_DECISION — misma combinación de señales matcheadas ---
function detectarMismaEvidenciaMismaDecision(casos: CalibrationCase[], umbralMinimoMuestra: number): CandidatoDeAutomatizacion[] {
  const grupos = agruparPorClave(calibrables(casos), (c) => {
    const señales = (c.structuredEvidence?.bank?.signals ?? []).filter((s) => s.matched).map((s) => s.signal).sort();
    return señales.length > 0 ? señales.join("+") : null; // sin señales coincidentes no es un patrón de evidencia
  });
  return [...grupos.entries()].map(([clave, grupo]) =>
    construirCandidato("SAME_EVIDENCE_SAME_DECISION", clave, grupo, `Combinación de señales "${clave}" repetida en ${grupo.length} caso(s).`, umbralMinimoMuestra)
  );
}

// --- SAME_REJECTION_REASON — mismo texto de rejectionReason ---
function detectarMismoMotivoDeRechazo(casos: CalibrationCase[], umbralMinimoMuestra: number): CandidatoDeAutomatizacion[] {
  const rechazados = calibrables(casos).filter((c) => c.groundTruth === "HUMAN_REJECTED" && c.humanRejectionReason);
  const grupos = agruparPorClave(rechazados, (c) => c.humanRejectionReason);
  return [...grupos.entries()].map(([clave, grupo]) =>
    construirCandidato("SAME_REJECTION_REASON", clave, grupo, `Motivo de rechazo "${clave}" repetido en ${grupo.length} caso(s).`, umbralMinimoMuestra)
  );
}

// --- SAME_CONTRADICTION_TYPE — mismo contradictionDetail ---
function detectarMismoTipoDeContradiccion(casos: CalibrationCase[], umbralMinimoMuestra: number): CandidatoDeAutomatizacion[] {
  const contradictorios = calibrables(casos).filter((c) => c.hasContradiction && c.contradictionDetail);
  const grupos = agruparPorClave(contradictorios, (c) => c.contradictionDetail);
  return [...grupos.entries()].map(([clave, grupo]) =>
    construirCandidato("SAME_CONTRADICTION_TYPE", clave, grupo, `Contradicción "${clave}" repetida en ${grupo.length} caso(s).`, umbralMinimoMuestra)
  );
}

// --- SAME_FAMILY_COMBINATION — misma independentFamiliesConverging ---
function detectarMismaCombinacionDeFamilias(casos: CalibrationCase[], umbralMinimoMuestra: number): CandidatoDeAutomatizacion[] {
  const grupos = agruparPorClave(calibrables(casos), (c) => {
    const familias = [...c.independentFamiliesConverging].sort();
    return familias.length > 0 ? familias.join("+") : null;
  });
  return [...grupos.entries()].map(([clave, grupo]) =>
    construirCandidato("SAME_FAMILY_COMBINATION", clave, grupo, `Convergencia de familias "${clave}" repetida en ${grupo.length} caso(s).`, umbralMinimoMuestra)
  );
}

// --- SAME_SCORE_RANGE — mismo bucket de score (20 puntos, igual criterio que metrics.ts) ---
function bucketDeScore(score: number): string {
  const piso = Math.floor(score / 20) * 20;
  return `${piso}-${piso + 19}`;
}
function detectarMismoRangoDeScore(casos: CalibrationCase[], umbralMinimoMuestra: number): CandidatoDeAutomatizacion[] {
  const grupos = agruparPorClave(calibrables(casos), (c) => (c.engineScore === null ? null : bucketDeScore(c.engineScore)));
  return [...grupos.entries()].map(([clave, grupo]) =>
    construirCandidato("SAME_SCORE_RANGE", clave, grupo, `Rango de score ${clave} repetido en ${grupo.length} caso(s).`, umbralMinimoMuestra)
  );
}

// --- SAME_TEMPORAL_PATTERN — mismo día de semana de la decisión ---
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
function detectarMismoPatronTemporal(casos: CalibrationCase[], umbralMinimoMuestra: number): CandidatoDeAutomatizacion[] {
  const grupos = agruparPorClave(calibrables(casos), (c) => (c.humanDecidedAt ? DIAS[new Date(c.humanDecidedAt).getUTCDay()] : null));
  return [...grupos.entries()].map(([clave, grupo]) =>
    construirCandidato("SAME_TEMPORAL_PATTERN", clave, grupo, `Decisiones repetidas los días "${clave}" — ${grupo.length} caso(s).`, umbralMinimoMuestra)
  );
}

export interface OpcionesDeDeteccion {
  umbralMinimoMuestra?: number;
}

/**
 * Detecta TODOS los patrones candidatos a automatización, dimensión por
 * dimensión — nunca automatiza nada, nunca decide un threshold. Las 2
 * dimensiones sin dato estructural hoy (`SAME_UNIT_OR_OBLIGATION_TYPE`,
 * `SAME_ORGANIZATION_BEHAVIOR`) devuelven explícitamente `medible: false`
 * con qué falta — ver FASE_5_11_AUDITORIA_DE_DISENO.md.
 */
export function detectarCandidatosDeAutomatizacion(casos: CalibrationCase[], opciones: OpcionesDeDeteccion = {}): CandidatoDeAutomatizacion[] {
  const umbralMinimoMuestra = opciones.umbralMinimoMuestra ?? UMBRAL_MINIMO_MUESTRA_DEFAULT;

  return [
    ...detectarMismaEvidenciaMismaDecision(casos, umbralMinimoMuestra),
    ...detectarMismoMotivoDeRechazo(casos, umbralMinimoMuestra),
    ...detectarMismoTipoDeContradiccion(casos, umbralMinimoMuestra),
    ...detectarMismaCombinacionDeFamilias(casos, umbralMinimoMuestra),
    ...detectarMismoRangoDeScore(casos, umbralMinimoMuestra),
    noMedible(
      "SAME_UNIT_OR_OBLIGATION_TYPE",
      'Unit no tiene ningún campo de "tipo" en schema (solo code/coefficient); Obligation.status es un estado de ciclo de vida (PENDING/PARTIALLY_PAID/PAID), no una categoría/tipo — y CalibrationCase no lo carga hoy.',
      "Definir qué significaría 'tipo de unidad/obligación' como decisión de negocio, y si hace falta, agregar el campo a Unit/Obligation o extender CalibrationCase para cargarlo desde el join real."
    ),
    ...detectarMismoPatronTemporal(casos, umbralMinimoMuestra),
    noMedible(
      "SAME_ORGANIZATION_BEHAVIOR",
      "CalibrationCase no carga organizationId — el dataset de calibración hoy no permite agrupar por organización sin un join adicional.",
      "Extender dataset.ts/loader.ts para propagar organizationId (vía Unit.organizationId) hasta CalibrationCase."
    ),
  ];
}
