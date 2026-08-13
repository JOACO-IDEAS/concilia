// Versión explícita de evidence-score.ts — Fase 5.9, mismo patrón y mismo
// motivo que src/lib/reconciliation/version.ts::MATCH_ENGINE_VERSION (sin
// inventar un esquema de versionado nuevo, tal como pedía esta fase: "si
// existe una forma mejor y más simple en el código actual, usala"). Cada
// PaymentEvidenceAssessmentLog declara qué versión de las reglas de
// independencia/familias/estados lo produjo.
//
// Subir este número cuando cambien: qué cuenta como familia con peso propio
// (WHATSAPP_MESSAGE/BANK_MOVEMENT/HISTORY), las reglas de independencia,
// la lógica de determinación de estado (evaluarPaymentEvidenceScore), o se
// active HISTORY (hoy deliberadamente MISSING). NO subir por cambios en
// deterministic-matcher.ts/confidence-engine.ts/signals.ts — esos ya tienen
// su propio MATCH_ENGINE_VERSION, independiente de este.
//
// "5.7.0" — no es un número de release del proyecto, es la fase en la que
// se escribió la lógica real que hoy vive en evidence-score.ts (Fase 5.7),
// sin cambios desde entonces. Se empieza a persistir recién en Fase 5.9,
// pero la versión identifica cuándo se definieron las REGLAS, no cuándo se
// empezó a guardar el resultado — mismo criterio que MATCH_ENGINE_VERSION.
export const EVIDENCE_SCORE_VERSION = "5.7.0";
