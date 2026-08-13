// Versión explícita del algoritmo de matching — Fase 3.4
// (FASE_3_4_IMPLEMENTATION_PLAN.md §5). Cada ShadowMatchResult declara qué
// versión lo produjo, para poder recalibrar pesos/tiers/reglas más adelante
// sin perder la trazabilidad de qué algoritmo generó cada resultado
// histórico. Subir este número cuando cambien: pesos de confidence-engine.ts,
// tiers de las señales, reglas de deterministic-matcher.ts, o se agregue/
// quite una señal.
// Fase 3.9 cambió una regla real de deterministic-matcher.ts (la
// comparación de ambigüedad ahora exige igual tier, no solo cercanía de
// score — ver FASE_3_9_CALIBRACION_Y_ARQUITECTURA_AGENTES.md §1) — sin
// subir este número, los resultados de antes y después de ese cambio
// quedarían indistinguibles en ShadowMatchLog, perdiendo exactamente la
// trazabilidad que este archivo existe para garantizar.
export const MATCH_ENGINE_VERSION = "3.9.0";
