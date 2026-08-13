// Fase 5.9 — orquestador que conecta evidence-score.ts (Fase 5.7, sin
// cambios) al pipeline real de pagos. Reemplaza a `ejecutarMatchingEnSombra`
// en los 2 call sites reales (webhook + carga de extracto): corre el motor
// bancario UNA sola vez y hace DOS persistencias independientes, cada una en
// su propio try/catch — best effort, ninguna depende de que la otra haya
// funcionado. Nunca lanza. El pago bancario (ya persistido antes de que
// esto se llame, siempre vía `after()`) nunca se ve afectado por un error
// acá — mismo principio ya establecido por shadow-runner.ts, extendido.
//
// Deliberadamente NO modifica shadow-runner.ts/match-engine.ts — los
// reutiliza tal cual. "No duplicar lógica existente" (pedido explícito de
// esta fase) significa exactamente esto: un segundo consumidor del mismo
// runMatchingInShadow, nunca una segunda implementación del motor.

import { runMatchingInShadow } from "@/lib/reconciliation/match-engine";
import { defaultShadowResultStore, type ShadowResultStore } from "@/lib/reconciliation/shadow-store";
import type { MatchContext } from "@/lib/reconciliation/deterministic-matcher";
import { evaluarPaymentEvidenceScore } from "./evidence-score";
import {
  candidatoUnitIdDesdeFamilias,
  defaultPaymentEvidenceAssessmentStore,
  type PaymentEvidenceAssessmentStore,
  type StructuredEvidenceSnapshot,
} from "./evidence-score-store";
import { EVIDENCE_SCORE_VERSION } from "./version";

const LOG = "[payment-evidence:shadow]";

export interface OpcionesEvaluacionSombraCompleta {
  context?: MatchContext;
  shadowStore?: ShadowResultStore;
  evidenceStore?: PaymentEvidenceAssessmentStore;
}

/**
 * Punto de integración único para el pipeline real. Sustituye la llamada a
 * `ejecutarMatchingEnSombra` en los call sites reales — hace todo lo que esa
 * función ya hacía (correr el motor + guardar en ShadowMatchLog) MÁS la
 * evaluación de evidence-score, sin recalcular el motor dos veces.
 *
 * whatsapp siempre `null` acá: no existe ningún endpoint de WhatsApp real
 * conectado a este pipeline todavía (Fase 5.3/5.4 — correlator
 * PaymentNotice↔PaymentTransaction sigue sin construir). Cuando exista, se
 * pasaría acá — el resto de la lógica no cambia.
 */
export async function ejecutarEvaluacionSombraCompleta(
  paymentTransactionId: string,
  opciones: OpcionesEvaluacionSombraCompleta = {}
): Promise<void> {
  const shadowStore = opciones.shadowStore ?? defaultShadowResultStore;
  const evidenceStore = opciones.evidenceStore ?? defaultPaymentEvidenceAssessmentStore;

  let resultadoBanco;
  try {
    resultadoBanco = await runMatchingInShadow(paymentTransactionId, opciones.context);
  } catch (e) {
    console.error(`${LOG} Error corriendo el motor de matching para ${paymentTransactionId} (no afecta el pago ya persistido):`, e);
    return;
  }

  try {
    await shadowStore.guardar(resultadoBanco);
  } catch (e) {
    console.error(`${LOG} Error persistiendo ShadowMatchLog para ${paymentTransactionId}:`, e);
  }

  try {
    const assessment = evaluarPaymentEvidenceScore({ bank: resultadoBanco, whatsapp: null });
    // Fase 5.9.1 — snapshot estructurado capturado del MISMO resultadoBanco
    // ya calculado arriba (nunca releído de ShadowMatchLog, ni ahora ni
    // después) — cierra la dependencia de auditoría identificada en
    // FASE_5_9_1_AUDITORIA_SEMANTICA.md §4. `whatsapp` siempre `null`: no
    // hay correlator PaymentNotice↔PaymentTransaction todavía (fuera de
    // alcance de esta fase).
    const structuredEvidence: StructuredEvidenceSnapshot = {
      bank: {
        signals: resultadoBanco.signals,
        blockers: resultadoBanco.blockers,
        topCandidates: resultadoBanco.topCandidates,
      },
      whatsapp: null,
    };
    await evidenceStore.guardar({
      paymentTransactionId,
      engineVersion: EVIDENCE_SCORE_VERSION,
      evaluatedAt: new Date().toISOString(),
      candidateUnitId: candidatoUnitIdDesdeFamilias(assessment.families),
      structuredEvidence,
      ...assessment,
    });
  } catch (e) {
    console.error(`${LOG} Error persistiendo PaymentEvidenceAssessmentLog para ${paymentTransactionId}:`, e);
  }
}
