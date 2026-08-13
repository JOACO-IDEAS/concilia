// Fase 5.10 — clasificación diagnóstica de casos donde MOTOR≠HUMANO (FP/FN).
// Función PURA. Nunca inventa la causa: si no es inferible directamente de
// blockers/contradicción/estructura ya presentes en el caso, la causa es
// "unknown" — pedido explícito de esta fase (Parte 6).

import type { BlockerType } from "@/lib/reconciliation/types";
import type { CalibrationCase, CausaDesacuerdo } from "./types";
import { categorizarConfusion } from "./metrics";

export interface CasoDeDesacuerdo {
  caso: CalibrationCase;
  categoria: "FP" | "FN";
  causa: CausaDesacuerdo;
  detalle: string;
}

function blockersDelCaso(caso: CalibrationCase): { type: BlockerType; evidence: string }[] {
  return caso.structuredEvidence?.bank?.blockers ?? [];
}

function tieneBlocker(blockers: { type: BlockerType }[], tipos: BlockerType[]): { type: BlockerType } | undefined {
  return blockers.find((b) => tipos.includes(b.type));
}

/**
 * Orden de inferencia, del más específico al más genérico. Se detiene en la
 * primera causa que los datos realmente sustentan — nunca combina evidencia
 * débil para "armar" una causa que ningún dato apoya directamente.
 */
function inferirCausa(caso: CalibrationCase, categoria: "FP" | "FN"): { causa: CausaDesacuerdo; detalle: string } {
  if (caso.hasContradiction) {
    return { causa: "contradictory_evidence", detalle: caso.contradictionDetail ?? "El caso está marcado hasContradiction=true sin detalle adicional." };
  }

  const blockers = blockersDelCaso(caso);

  const phone = tieneBlocker(blockers, ["PHONE_AMBIGUOUS"]);
  if (phone) return { causa: "phone_ambiguity", detalle: blockers.find((b) => b.type === "PHONE_AMBIGUOUS")!.evidence };

  const duplicado = tieneBlocker(blockers, ["DUPLICATE"]);
  if (duplicado) return { causa: "duplicate_candidate", detalle: blockers.find((b) => b.type === "DUPLICATE")!.evidence };

  const identidad = tieneBlocker(blockers, ["MULTIPLE_EQUIVALENT_CANDIDATES", "UNIT_CODE_AMBIGUOUS", "IDENTITY_CONFLICT", "CUIT_CONTRADICTORY"]);
  if (identidad) {
    const b = blockers.find((x) => x.type === identidad.type)!;
    return { causa: "ambiguous_identity", detalle: b.evidence };
  }

  const historico = tieneBlocker(blockers, ["PREVIOUSLY_REJECTED"]);
  if (historico) return { causa: "historical_context_missing", detalle: blockers.find((b) => b.type === "PREVIOUSLY_REJECTED")!.evidence };

  const datosInsuficientes = tieneBlocker(blockers, ["NO_UNITS_IN_ORGANIZATION", "INSUFFICIENT_EVIDENCE"]);
  if (datosInsuficientes) {
    const b = blockers.find((x) => x.type === datosInsuficientes.type)!;
    return { causa: "insufficient_structured_data", detalle: b.evidence };
  }

  const amountIncompatible = tieneBlocker(blockers, ["AMOUNT_INCOMPATIBLE"]);
  if (amountIncompatible) return { causa: "missing_evidence", detalle: blockers.find((b) => b.type === "AMOUNT_INCOMPATIBLE")!.evidence };

  if (!caso.structuredEvidence) {
    return { causa: "insufficient_structured_data", detalle: "El caso no tiene structuredEvidence guardado — no hay señales/blockers disponibles para diagnosticar." };
  }

  // No hay blocker ni contradicción que explique el desacuerdo — es un
  // FP/FN "limpio" a nivel de datos estructurados: el motor y el humano
  // simplemente leyeron distinto la misma evidencia disponible.
  if (categoria === "FP") {
    return { causa: "false_positive_probable", detalle: `Motor propuso candidato (score=${caso.engineScore ?? "?"}, tier=${caso.tier ?? "?"}) sin blockers ni contradicción registrados, pero el humano rechazó.` };
  }
  return { causa: "false_negative_probable", detalle: `Motor no llegó a estado positivo (estado=${caso.engineState}) sin blockers ni contradicción registrados, pero el humano aprobó.` };
}

/** `null` si el caso no es un desacuerdo calibrable (TP/TN/NOT_CALIBRATABLE). */
export function clasificarDesacuerdo(caso: CalibrationCase): CasoDeDesacuerdo | null {
  const categoria = categorizarConfusion(caso);
  if (categoria !== "FP" && categoria !== "FN") return null;
  const { causa, detalle } = inferirCausa(caso, categoria);
  return { caso, categoria, causa, detalle };
}

export function analizarDesacuerdos(casos: CalibrationCase[]): CasoDeDesacuerdo[] {
  const resultado: CasoDeDesacuerdo[] = [];
  for (const caso of casos) {
    const clasificado = clasificarDesacuerdo(caso);
    if (clasificado) resultado.push(clasificado);
  }
  return resultado;
}

export interface ResumenDeCausas {
  causa: CausaDesacuerdo;
  cantidad: number;
}

/** Conteo de causas sobre un conjunto de desacuerdos ya clasificados — insumo directo para el informe final (Parte 10). */
export function resumirCausas(desacuerdos: CasoDeDesacuerdo[]): ResumenDeCausas[] {
  const mapa = new Map<CausaDesacuerdo, number>();
  for (const d of desacuerdos) mapa.set(d.causa, (mapa.get(d.causa) ?? 0) + 1);
  return [...mapa.entries()].map(([causa, cantidad]) => ({ causa, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
}
