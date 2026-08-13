// Fase 5.10 — minería de patrones explicables (Parte 7: "aprendizaje sin ML
// todavía"). NO es un modelo — es conteo directo, transparente, sobre
// combinaciones de señales/familias que ya existen en el dataset. Cada
// patrón queda con su tamaño de muestra visible; `confiable` es la única
// señal de "úsalo o no" — nunca se oculta el número real detrás de un
// promedio. Función PURA.

import type { CalibrationCase } from "./types";
import { UMBRAL_MINIMO_MUESTRA_DEFAULT } from "./metrics";

export type TipoDePatron = "SIGNAL_COMBINATION" | "FAMILY_CONVERGENCE";

/** Fase 5.11 — separación obligatoria de procedencia dentro de cada patrón (Regla 3: nunca mezclar ORGANIC/SYNTHETIC_DEMO sin etiquetarlo). Ver decision-provenance.ts. */
export interface OrigenDeMuestra {
  organic: number;
  syntheticDemo: number;
}

export interface PatronDeCalibracion {
  tipo: TipoDePatron;
  firma: string[]; // ordenada alfabéticamente, para que la misma combinación siempre agrupe igual
  totalCasos: number;
  aprobados: number;
  rechazados: number;
  tasaAprobacion: number; // aprobados / totalCasos
  confiable: boolean; // totalCasos >= umbralMinimoMuestra
  descripcion: string;
  /** paymentTransactionId de cada caso que sustenta este patrón — trazabilidad completa, nunca solo un número. */
  casosIds: string[];
  origenDeMuestra: OrigenDeMuestra;
}

const SIN_SENALES = "(sin señales coincidentes)";
const SIN_FAMILIAS = "(ninguna familia convergente)";

interface Acumulador {
  firma: string[];
  aprobados: number;
  rechazados: number;
  casosIds: string[];
  origenDeMuestra: OrigenDeMuestra;
}

function acumular(mapa: Map<string, Acumulador>, firma: string[], caso: CalibrationCase, esAprobado: boolean) {
  const clave = firma.length > 0 ? firma.join("+") : "(vacío)";
  const actual = mapa.get(clave) ?? { firma, aprobados: 0, rechazados: 0, casosIds: [], origenDeMuestra: { organic: 0, syntheticDemo: 0 } };
  if (esAprobado) actual.aprobados += 1;
  else actual.rechazados += 1;
  actual.casosIds.push(caso.paymentTransactionId);
  if (caso.humanDecisionProvenance === "ORGANIC") actual.origenDeMuestra.organic += 1;
  else if (caso.humanDecisionProvenance === "SYNTHETIC_DEMO") actual.origenDeMuestra.syntheticDemo += 1;
  mapa.set(clave, actual);
}

function construirPatrones(mapa: Map<string, Acumulador>, tipo: TipoDePatron, umbralMinimoMuestra: number, etiquetaVacia: string): PatronDeCalibracion[] {
  const patrones: PatronDeCalibracion[] = [];
  for (const { firma, aprobados, rechazados, casosIds, origenDeMuestra } of mapa.values()) {
    const totalCasos = aprobados + rechazados;
    const tasaAprobacion = totalCasos > 0 ? aprobados / totalCasos : 0;
    const confiable = totalCasos >= umbralMinimoMuestra;
    const nombrePatron = firma.length > 0 ? firma.join(" + ") : etiquetaVacia;
    const descripcion =
      tipo === "SIGNAL_COMBINATION"
        ? `Cuando aparecen ${nombrePatron}, los humanos aprobaron ${aprobados}/${totalCasos} casos (${Math.round(tasaAprobacion * 100)}%).`
        : `Cuando convergen ${nombrePatron}, los humanos aprobaron ${aprobados}/${totalCasos} casos (${Math.round(tasaAprobacion * 100)}%).`;
    patrones.push({ tipo, firma, totalCasos, aprobados, rechazados, tasaAprobacion, confiable, descripcion, casosIds, origenDeMuestra });
  }
  return patrones.sort((a, b) => b.totalCasos - a.totalCasos);
}

/**
 * Mina patrones sobre TODOS los casos con ground truth humano real
 * (HUMAN_CONFIRMED/HUMAN_REJECTED) — UNRESOLVED/INSUFFICIENT_DATA quedan
 * afuera porque no tienen un resultado humano para correlacionar. Devuelve
 * TODOS los patrones encontrados, cada uno marcado `confiable` según
 * `umbralMinimoMuestra` — el caller decide si muestra los no confiables o
 * los filtra (ver `filtrarPatronesConfiables`). Nunca se descarta el dato
 * crudo, solo se etiqueta su confiabilidad.
 */
export function minarPatrones(casos: CalibrationCase[], umbralMinimoMuestra: number = UMBRAL_MINIMO_MUESTRA_DEFAULT): PatronDeCalibracion[] {
  const calibrables = casos.filter((c) => c.groundTruth === "HUMAN_CONFIRMED" || c.groundTruth === "HUMAN_REJECTED");

  const porFirmaDeSenales = new Map<string, Acumulador>();
  const porFirmaDeFamilias = new Map<string, Acumulador>();

  for (const caso of calibrables) {
    const esAprobado = caso.groundTruth === "HUMAN_CONFIRMED";

    const señalesCoincidentes = (caso.structuredEvidence?.bank?.signals ?? [])
      .filter((s) => s.matched)
      .map((s) => s.signal)
      .sort();
    acumular(porFirmaDeSenales, señalesCoincidentes, caso, esAprobado);

    const familiasConvergentes = [...caso.independentFamiliesConverging].sort();
    acumular(porFirmaDeFamilias, familiasConvergentes, caso, esAprobado);
  }

  return [
    ...construirPatrones(porFirmaDeSenales, "SIGNAL_COMBINATION", umbralMinimoMuestra, SIN_SENALES),
    ...construirPatrones(porFirmaDeFamilias, "FAMILY_CONVERGENCE", umbralMinimoMuestra, SIN_FAMILIAS),
  ];
}

/** Solo los patrones con muestra suficiente — lo que debe mostrarse en el informe final (Parte 7: "Solo mostrar patrones con observaciones suficientes"). */
export function filtrarPatronesConfiables(patrones: PatronDeCalibracion[]): PatronDeCalibracion[] {
  return patrones.filter((p) => p.confiable);
}
