// Fase 5.11 — snapshot de los parámetros REALES que hoy gobiernan el motor
// de matching, en un único lugar, para que `recommendation.ts` y
// `threshold-simulation.ts` (Fase 5.10) nunca dupliquen ni desincronicen el
// mismo número. Cada constante cita el archivo:línea real de donde se leyó
// — nunca se inventa un parámetro nuevo acá (pedido explícito de esta fase:
// "usá exclusivamente los parámetros que realmente existan hoy en el
// código"). Los 3 archivos fuente (`deterministic-matcher.ts`,
// `confidence-engine.ts`, `signals.ts`) son archivos protegidos — este
// módulo NUNCA los importa ni los modifica, solo documenta sus valores
// actuales como constantes propias, re-verificadas por lectura directa del
// código en cada fase que las usa.

import type { Tier } from "@/lib/reconciliation/types";

/** `deterministic-matcher.ts:52` — `const MARGEN_AMBIGUEDAD = 10;` (no exportado). Gobierna cuándo dos candidatos del mismo tier se consideran empatados → AMBIGUOUS. */
export const MARGEN_AMBIGUEDAD_ACTUAL = 10;

/** `confidence-engine.ts:14` — `const PUNTOS_POR_TIER: Record<Tier, number> = {1: 40, 2: 22, 3: 12, 4: 5};` (no exportado). Puntos aditivos-capados-en-99 por tier de señal. */
export const PUNTOS_POR_TIER_ACTUAL: Record<Tier, number> = { 1: 40, 2: 22, 3: 12, 4: 5 };

/** `signals.ts:14` — `const VENTANA_FECHA_DIAS = 45;` (no exportado). Ventana de días dentro de la cual `DATE_COMPATIBLE` matchea. */
export const VENTANA_FECHA_DIAS_ACTUAL = 45;

/**
 * Snapshot completo, tipado, para armar comparaciones CURRENT CONFIG vs.
 * PROPOSED CONFIG (`recommendation.ts`). Solo los 3 parámetros reales de
 * arriba — ningún peso/threshold inventado.
 */
export interface ConfiguracionDelMotor {
  marginAmbiguedad: number;
  puntosPorTier: Record<Tier, number>;
  ventanaFechaDias: number;
}

export const CONFIGURACION_ACTUAL: ConfiguracionDelMotor = {
  marginAmbiguedad: MARGEN_AMBIGUEDAD_ACTUAL,
  puntosPorTier: PUNTOS_POR_TIER_ACTUAL,
  ventanaFechaDias: VENTANA_FECHA_DIAS_ACTUAL,
};
