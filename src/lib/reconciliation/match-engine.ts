// Orquestador — único punto de entrada público del motor de matching en
// modo sombra (Fase 3.3). `runMatchingInShadow` LEE un PaymentTransaction y
// DEVUELVE un resultado; nunca escribe nada — ni en PaymentTransaction, ni
// en Obligation, ni en UnitOwner, ni en Unit, ni en ReconciliationMatch. La
// persistencia del resultado (Fase 3.4) vive un nivel arriba, en
// shadow-runner.ts — este archivo sigue siendo puramente de cálculo.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { generarCandidatos } from "./candidate-generator";
import { evaluarDeterministico, type CandidateEntry, type DeterministicMatchOutput, type MatchContext } from "./deterministic-matcher";
import type { ShadowMatchResult, TopCandidateDiagnostico } from "./types";
import { MATCH_ENGINE_VERSION } from "./version";

function construirExplicacion(resultado: DeterministicMatchOutput): string {
  if (resultado.status === "BLOCKED") {
    return resultado.globalBlockers.length > 0
      ? resultado.globalBlockers.map((b) => `✗ ${b.evidence}`).join("\n")
      : `✗ ${resultado.candidates[0]?.blockers.map((b) => b.evidence).join(" ") ?? "Bloqueado."}`;
  }

  if (resultado.status === "AMBIGUOUS") {
    return resultado.globalBlockers.map((b) => `⚠ ${b.evidence}`).join("\n");
  }

  const ganador = resultado.winner as CandidateEntry;
  const lineas: string[] = [];
  for (const s of ganador.signals) {
    if (!s.matched) continue;
    const marca = s.strength === "WEAK" ? "⚠" : "✓";
    lineas.push(`${marca} ${s.evidence}`);
  }
  // Ausencias relevantes: solo las señales fuertes (Tier 1/2) que no
  // matchearon aportan algo útil a la explicación — el resto sería ruido.
  for (const s of ganador.signals) {
    if (s.matched || s.tier > 2) continue;
    lineas.push(`⚠ ${s.evidence}`);
  }
  return lineas.join("\n");
}

const TOPE_TOP_CANDIDATES = 3;

/**
 * Fase 5.1 — top N candidatos reales, con identidad, para diagnóstico
 * (nunca decide nada, mismo principio que topCandidateScore/Tier). Se arma
 * directamente desde `candidates` (ya ordenado por score desc en
 * deterministic-matcher.ts) — sin recalcular nada, sin tocar ese archivo.
 */
// Fase 5.3 — exportada (sin cambiar su lógica) para que
// payment-evidence/ingest-whatsapp-evidence.ts reutilice exactamente el
// mismo cálculo en vez de duplicarlo — "no crear un segundo motor".
export function construirTopCandidates(candidates: CandidateEntry[]): TopCandidateDiagnostico[] | null {
  if (candidates.length === 0) return null;
  return candidates.slice(0, TOPE_TOP_CANDIDATES).map((c) => ({
    unitCode: c.unitCode,
    score: c.score,
    tier: c.tier,
    matchedSignals: c.signals.filter((s) => s.matched).map((s) => s.signal),
  }));
}

function resultadoBloqueado(paymentTransactionId: string, evidencia: string): ShadowMatchResult {
  return {
    paymentTransactionId,
    candidateUnitId: null,
    candidateUnitOwnerId: null,
    candidateObligationId: null,
    score: 0,
    tier: null,
    status: "BLOCKED",
    signals: [],
    blockers: [{ type: "INSUFFICIENT_EVIDENCE", evidence: evidencia }],
    explanation: `✗ ${evidencia}`,
    engineVersion: MATCH_ENGINE_VERSION,
    evaluatedAt: new Date().toISOString(),
    // Sin organización resuelta todavía no se llegó a generar ningún
    // universo de candidatos — null, no 0 (ver types.ts).
    topCandidateScore: null,
    topCandidateTier: null,
    topCandidates: null,
  };
}

/**
 * Corre el motor de matching en MODO SOMBRA sobre un PaymentTransaction
 * puntual. Solo lectura — devuelve el resultado, nunca lo persiste. AUTO no
 * existe como posible `status` (ver types.ts) — no hay ningún camino desde
 * acá que pueda ejecutar una conciliación real.
 */
export async function runMatchingInShadow(
  paymentTransactionId: string,
  context: MatchContext = {}
): Promise<ShadowMatchResult> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const payment = await tx.paymentTransaction.findUnique({ where: { id: paymentTransactionId } });
    if (!payment) {
      throw new Error(`No existe ningún PaymentTransaction con id ${paymentTransactionId}.`);
    }

    if (!payment.organizationId) {
      return resultadoBloqueado(
        paymentTransactionId,
        "El pago todavía no tiene una organización resuelta (Capa 1, reconcile-payment.ts) — el motor de unidad no puede correr sin eso."
      );
    }

    const universe = await generarCandidatos(tx, payment.organizationId);

    const resultado = await evaluarDeterministico(
      tx,
      {
        id: payment.id,
        amount: payment.amount.toNumber(),
        payerIdentifier: payment.payerIdentifier,
        concept: payment.concept,
        transactionDate: payment.transactionDate,
        referenceNumber: payment.referenceNumber,
      },
      universe,
      context
    );

    const ganador = resultado.winner;
    // Fase 3.9 — el mejor candidato REAL, sin importar si terminó bloqueado
    // (candidates ya viene ordenado por score desc, ver deterministic-matcher.ts).
    // `candidates` vacío (ej. NO_UNITS_IN_ORGANIZATION) → sin candidato que
    // reportar, `null` — distinto de "hubo candidatos, el mejor sumó 0".
    const mejorCandidatoReal = resultado.candidates[0] as CandidateEntry | undefined;

    return {
      paymentTransactionId,
      candidateUnitId: ganador?.unitId ?? null,
      candidateUnitOwnerId: ganador?.unitOwnerId ?? null,
      candidateObligationId: ganador?.obligationId ?? null,
      score: ganador?.score ?? 0,
      tier: ganador?.tier ?? null,
      status: resultado.status,
      signals: ganador?.signals ?? [],
      blockers: [...resultado.globalBlockers, ...(ganador?.blockers ?? [])],
      explanation: construirExplicacion(resultado),
      engineVersion: MATCH_ENGINE_VERSION,
      evaluatedAt: new Date().toISOString(),
      topCandidateScore: mejorCandidatoReal?.score ?? null,
      topCandidateTier: mejorCandidatoReal?.tier ?? null,
      topCandidates: construirTopCandidates(resultado.candidates),
    };
  });
}
