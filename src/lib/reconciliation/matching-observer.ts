// Fase 4.F — "Observador de Matching": segundo agente real del Agent OS,
// siguiendo exactamente el patrón de src/lib/compliance/compliance-detector.ts
// (mismo pipeline DATOS → OBSERVACIÓN → CONTEXTO, reusable por cualquier
// agente futuro).
//
// 100% DETERMINÍSTICO — cero LLM, cero interpretación. Este módulo NUNCA
// vuelve a evaluar un pago: LEE resultados ya calculados y persistidos por
// el motor de matching (ShadowMatchLog, vía shadow-store.ts, sin modificar
// ese archivo) y ESCRIBE únicamente en AgentObservation (vía
// @/lib/agent-os/observation-store.ts) — nunca en PaymentTransaction,
// ShadowMatchLog, ReconciliationMatch, Obligation ni UnitOwner. No ejecuta
// ninguna acción externa, no envía nada, no mueve dinero, no aprueba nada.
//
// Deliberadamente NO genera observación para CANDIDATE: un match limpio no
// es un problema que requiera atención humana — el panel lo reporta
// agregado (conteo real) en el resumen ejecutivo, nunca como una fila de
// AgentObservation (evitar que 🟢 "resuelto" se confunda con "nunca fue un
// problema", ver diagnóstico de esta fase).
//
// LIMITACIÓN CONOCIDA, documentada explícitamente (no se tapa con una
// suposición): ShadowMatchLog solo persiste `signals`/`blockers` del
// candidato GANADOR (null cuando el status es AMBIGUOUS/BLOCKED) más
// topCandidateScore/topCandidateTier (puramente numérico, diagnóstico). La
// lista completa de candidatos evaluados (ej. "Unidad 1A vs. Unidad 2B" en
// un caso AMBIGUOUS) vive únicamente en memoria dentro de
// deterministic-matcher.ts durante el cálculo y nunca se persiste. Este
// observador, por lo tanto, NUNCA puede mostrar la identidad de los
// candidatos en disputa de un AMBIGUOUS — solo el texto real del blocker
// ("Hay N candidatos con evidencia comparable") y el score/tier diagnóstico
// del mejor. Mostrar identidades específicas sería inventar una relación
// que el dato no sostiene.

import type { Prisma } from "@/generated/prisma/client";
import { defaultShadowResultStore, type ShadowMatchRecord, type ShadowResultStore } from "./shadow-store";
import { MATCH_ENGINE_VERSION } from "./version";
import { guardarObservacion, resolverObservacionesNoConfirmadas } from "@/lib/agent-os/observation-store";
import type { ObservacionAgente } from "@/lib/agent-os/types";
import type { TopCandidateDiagnostico } from "./types";

const AGENT_TYPE = "MATCHING" as const;
const SOURCE = "reconciliation:shadow-match-observer";

function dedupeKeyPago(tipoObservacion: string, paymentTransactionId: string): string {
  return `${AGENT_TYPE}:${SOURCE}:${tipoObservacion}:payment:${paymentTransactionId}`;
}

export interface ResultadoObservacionMatching {
  shadowMatchLogsEvaluados: number;
  observacionesGeneradas: number;
  observacionesResueltas: number;
}

export interface OpcionesObservadorDeMatching {
  store?: ShadowResultStore; // inyectable para tests — nunca Neon en tests, mismo criterio que observability.ts/shadow-runner.ts
}

// Fase 5.2 — recomendación contextual para AMBIGUOUS, usando exclusivamente
// `topCandidates` real (Fase 5.1, ya persistido por match-engine.ts — cero
// recálculo acá). Nunca inventa candidatos: si `topCandidates` no existe o
// no hay un empate real de score, se cae al texto genérico de siempre.
function construirSuggestedActionAmbiguous(topCandidates: TopCandidateDiagnostico[] | null): string {
  const generico = "Revisar el pago manualmente — hay más de un candidato posible y el motor no puede desempatar solo.";
  if (!topCandidates || topCandidates.length < 2) return generico;

  const mejorScore = topCandidates[0].score;
  const empatados = topCandidates.filter((c) => c.score === mejorScore);
  if (empatados.length < 2) return generico;

  const unidades = empatados.map((c) => `UF ${c.unitCode}`);
  const listado = unidades.length === 2 ? unidades.join(" y ") : `${unidades.slice(0, -1).join(", ")} y ${unidades[unidades.length - 1]}`;
  return `Revisar manualmente entre ${listado} — ninguna tiene evidencia claramente superior.`;
}

function construirEvidencia(
  record: ShadowMatchRecord,
  pago: { amount: number; transactionDate: Date | null; referenceNumber: string | null; concept: string | null }
) {
  return {
    paymentTransactionId: record.paymentTransactionId,
    amount: pago.amount,
    transactionDate: pago.transactionDate ? pago.transactionDate.toISOString() : null,
    referenceNumber: pago.referenceNumber,
    concept: pago.concept,
    status: record.status,
    blockers: record.blockers,
    topCandidateScore: record.topCandidateScore,
    topCandidateTier: record.topCandidateTier,
    // Fase 5.1 — identidad real de hasta 3 candidatos (UF + score + tier +
    // señales que matchearon), cuando el motor los calculó. `null` si no
    // hubo ningún candidato — nunca inventado acá, viene tal cual de
    // ShadowMatchLog (ver match-engine.ts::construirTopCandidates).
    topCandidates: record.topCandidates,
    engineVersion: record.engineVersion,
    evaluatedAt: record.evaluatedAt,
  };
}

/**
 * Corre sobre TODOS los resultados de `ShadowMatchLog` en la versión ACTUAL
 * del motor (`MATCH_ENGINE_VERSION`) — versiones viejas (de una recalibración
 * anterior) se ignoran a propósito, mismo motivo que `resolverContextoCandidato`
 * en observability.ts: no tiene sentido observar un resultado que el motor
 * ya no produciría hoy. Idempotente: correr dos veces con los mismos datos
 * deja el mismo resultado (upsert por `dedupeKey`); si un pago que estaba
 * AMBIGUOUS/BLOCKED se re-evalúa (nueva corrida del motor) y ahora es
 * CANDIDATE, la observación correspondiente se auto-resuelve.
 */
export async function ejecutarObservadorDeMatching(
  tx: Prisma.TransactionClient,
  opciones: OpcionesObservadorDeMatching = {}
): Promise<ResultadoObservacionMatching> {
  const store = opciones.store ?? defaultShadowResultStore;
  const todos = await store.listar({ engineVersion: MATCH_ENGINE_VERSION });
  const relevantes = todos.filter((r) => r.status === "AMBIGUOUS" || r.status === "BLOCKED");

  const paymentIds = relevantes.map((r) => r.paymentTransactionId);
  const pagos =
    paymentIds.length > 0
      ? await tx.paymentTransaction.findMany({
          where: { id: { in: paymentIds } },
          select: { id: true, organizationId: true, amount: true, transactionDate: true, referenceNumber: true, concept: true },
        })
      : [];
  const pagoPorId = new Map(pagos.map((p) => [p.id, p]));

  const observaciones: ObservacionAgente[] = [];

  for (const record of relevantes) {
    const pago = pagoPorId.get(record.paymentTransactionId);
    // El pago pudo haberse borrado entre que se calculó el ShadowMatchLog y
    // ahora — sin el pago real no hay nada que observar de forma segura.
    if (!pago) continue;

    const tipo = record.status === "BLOCKED" ? ("PAYMENT_MATCH_BLOCKED" as const) : ("PAYMENT_MATCH_AMBIGUOUS" as const);
    const severity = record.status === "BLOCKED" ? ("CRITICAL" as const) : ("WARNING" as const);
    const monto = pago.amount.toNumber();

    const evidence = construirEvidencia(record, {
      amount: monto,
      transactionDate: pago.transactionDate,
      referenceNumber: pago.referenceNumber,
      concept: pago.concept,
    });

    const explanationBase =
      record.status === "BLOCKED"
        ? `El motor de matching bloqueó un pago de $${monto.toLocaleString("es-AR")}.`
        : `El motor de matching encontró más de un candidato posible para un pago de $${monto.toLocaleString("es-AR")}, sin un ganador claro.`;

    observaciones.push({
      agentType: AGENT_TYPE,
      type: tipo,
      severity,
      providerId: null,
      providerDocumentId: null,
      // Real, directo del pago — nunca resuelto por heurística. Puede ser
      // null si el pago todavía no tiene organización resuelta (Capa 1,
      // reconcile-payment.ts) — en ese caso la observación también queda
      // sin organización, honestamente, en vez de inventar una.
      organizationId: pago.organizationId,
      paymentTransactionId: record.paymentTransactionId,
      explanation: `${explanationBase} ${record.explanation}`.trim(),
      evidence,
      suggestedAction:
        record.status === "BLOCKED"
          ? "Revisar el pago manualmente — el motor de matching no pudo proponer un candidato seguro."
          : construirSuggestedActionAmbiguous(record.topCandidates),
      source: SOURCE,
      confidence: null,
      dedupeKey: dedupeKeyPago(tipo, record.paymentTransactionId),
      detectedAt: record.evaluatedAt,
    });
  }

  for (const obs of observaciones) {
    await guardarObservacion(tx, obs);
  }

  const observacionesResueltas = await resolverObservacionesNoConfirmadas(
    tx,
    AGENT_TYPE,
    SOURCE,
    observaciones.map((o) => o.dedupeKey)
  );

  return {
    shadowMatchLogsEvaluados: todos.length,
    observacionesGeneradas: observaciones.length,
    observacionesResueltas,
  };
}
