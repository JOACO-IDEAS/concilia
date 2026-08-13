// Fase 5.11 — Hallazgo 1 de FASE_5_11_AUDITORIA_DE_DISENO.md: `origin` de
// Fase 5.10 marca si el PAGO/EVALUACIÓN es real o de test — nunca respondió
// "¿esta decisión la tomó un administrador real?". `ReconciliationMatch` no
// tiene ningún campo estructurado de procedencia (`reason: String`
// requerido, texto libre; sin `updatedAt` — comentario del propio schema:
// "no hay updatedAt, la fila no se edita", confirma append-only por diseño
// original). Agregar un campo estructurado requeriría una migración — se
// documenta como decisión pendiente (ver informe final), NO se ejecuta esta
// fase.
//
// Resolución sin tocar schema: heurística de texto sobre `reason`/
// `rejectionReason`, pura y testeada. Reconoce:
//  1) el marcador YA USADO por el script real de Fase 5.10
//     (`scripts/fase-5-10-calibracion/01-registrar-decisiones-demo.mts`,
//     literalmente contiene "SINTÉTICA" en ambos `reason`) — retrocompatible
//     con los 2 casos reales ya escritos en dev-fixtures.
//  2) un marcador explícito hacia adelante, `[SYNTHETIC_DEMO]`, para
//     cualquier escritura de prueba nueva de esta fase o futuras.
// Default: ORGANIC — cualquier decisión real de un administrador futuro no
// tendrá ninguno de estos marcadores, así que el default es la clasificación
// correcta, nunca al revés (nunca asumir SYNTHETIC_DEMO por descarte).

export type DecisionProvenance = "ORGANIC" | "SYNTHETIC_DEMO";

/** Marcador explícito recomendado para cualquier escritura de demostración nueva — inclúyanlo en `reason` o `rejectionReason`. */
export const MARCADOR_DECISION_SINTETICA_DEMO = "[SYNTHETIC_DEMO]";

/** Marcador heredado de Fase 5.10 (texto libre, no un marcador formal) — reconocido solo por retrocompatibilidad con datos ya escritos. */
const MARCADOR_HEREDADO_FASE_5_10 = "SINTÉTICA";

/**
 * Infiere la procedencia de UNA decisión humana a partir de su texto. Pura
 * — no toca Prisma, no depende de ningún estado externo. `null`/`undefined`
 * en ambos campos (no debería ocurrir, `reason` es requerido en schema) cae
 * en ORGANIC por el mismo principio de default seguro.
 */
export function inferirProvenanceDeDecision(reason: string | null | undefined, rejectionReason?: string | null): DecisionProvenance {
  const texto = `${reason ?? ""} ${rejectionReason ?? ""}`;
  if (texto.includes(MARCADOR_DECISION_SINTETICA_DEMO) || texto.includes(MARCADOR_HEREDADO_FASE_5_10)) {
    return "SYNTHETIC_DEMO";
  }
  return "ORGANIC";
}
