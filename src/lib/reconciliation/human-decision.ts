// Fase 5.8 — registro de decisiones humanas (APPROVED/REJECTED) a nivel de
// UNIDAD sobre un candidato ya propuesto por el motor. Cierra un gap real:
// `ReconciliationMatch` ya existe desde Fase 3.x con exactamente esta forma
// (decision/score/signals/reason/decidedBy/rejectionReason), y
// `deterministic-matcher.ts` YA LEE decision="REJECTED" para el blocker
// `PREVIOUSLY_REJECTED` (scoped por paymentTransactionId+unitId) — pero
// hasta esta fase, nada en el código real escribía esa fila. El lado de
// lectura estaba listo; faltaba el escritor.
//
// Alcance DELIBERADAMENTE más angosto que "Aprobar" en
// RECONCILIATION_MATCHING_ARCHITECTURE.md §12 ("mismo efecto que AUTO":
// actualizar PaymentTransaction.unitId + Obligation.paidAmount/status): esta
// fase prohíbe explícitamente "escribir conciliaciones reales". Esta función
// escribe ÚNICAMENTE el EVENTO de decisión en ReconciliationMatch — nunca
// toca PaymentTransaction, Obligation, Unit ni UnitOwner. La aplicación
// contable real de una aprobación queda fuera de alcance, sin decidir ni
// implementar, para una fase futura que lo apruebe explícitamente.
//
// Cero cambio de schema: ReconciliationMatch ya tenía todos los campos
// necesarios, sin usar, desde antes de esta fase.

import type { Prisma } from "@/generated/prisma/client";
import type { Signal } from "./types";

// Nunca AUTO/SUGGESTED/EXCEPTION acá — esos son otros caminos (o
// deliberadamente inexistentes, AUTO sigue deshabilitado). Este módulo
// existe exclusivamente para decisiones humanas explícitas.
export type TipoDecisionHumana = "APPROVED" | "REJECTED";

export interface RegistrarDecisionHumanaInput {
  paymentTransactionId: string;
  unitId: string;
  obligationId: string | null;
  decision: TipoDecisionHumana;
  // Reutilizados del candidato YA evaluado por el motor real (ShadowMatchResult
  // o el ganador de evaluarDeterministico) — nunca inventados ni recalculados
  // acá. `null` es válido para un vínculo manual sin scoring (mismo criterio
  // documentado en el propio schema: "null en... un vínculo manual sin
  // scoring").
  score: number | null;
  signals: Signal[];
  reason: string;
  // Sin autenticación real de usuarios todavía (gap documentado desde Fase
  // 3.x) — se acepta `null`, nunca se inventa un usuario falso.
  decidedBy: string | null;
  // Requerido si decision="REJECTED" (mismo criterio que el comentario del
  // schema: "solo cuando decision = REJECTED") — validado en runtime abajo,
  // no solo por tipos, porque el caller puede venir de fuera de TS (Server
  // Action con FormData).
  rejectionReason?: string | null;
}

export interface DecisionHumanaRegistrada {
  id: string;
  decision: TipoDecisionHumana;
  createdAt: Date;
}

/**
 * Registra UN evento de decisión humana en `ReconciliationMatch`. Append-only
 * — nunca actualiza una fila existente (mismo criterio que el resto del
 * modelo). No valida reglas de negocio más allá de lo que el propio schema
 * ya exige; no revalida el candidato contra el motor (eso ya ocurrió antes
 * de que un humano viera la propuesta) — confía en que `unitId`/
 * `obligationId` reales existen (la FK de Prisma lo garantiza; si no
 * existen, esta función lanza, igual que cualquier otra escritura del
 * proyecto).
 */
export async function registrarDecisionHumana(
  tx: Prisma.TransactionClient,
  input: RegistrarDecisionHumanaInput
): Promise<DecisionHumanaRegistrada> {
  if (input.decision === "REJECTED" && !input.rejectionReason) {
    throw new Error("Un rechazo (REJECTED) requiere `rejectionReason` — no se puede registrar sin motivo.");
  }

  const pago = await tx.paymentTransaction.findUnique({ where: { id: input.paymentTransactionId }, select: { id: true } });
  if (!pago) {
    throw new Error(`No existe ningún PaymentTransaction con id ${input.paymentTransactionId}.`);
  }

  const fila = await tx.reconciliationMatch.create({
    data: {
      paymentTransactionId: input.paymentTransactionId,
      unitId: input.unitId,
      obligationId: input.obligationId,
      decision: input.decision,
      score: input.score,
      signals: input.signals as unknown as Prisma.InputJsonValue,
      reason: input.reason,
      decidedBy: input.decidedBy,
      rejectionReason: input.decision === "REJECTED" ? (input.rejectionReason ?? null) : null,
    },
    select: { id: true, decision: true, createdAt: true },
  });

  return { id: fila.id, decision: fila.decision as TipoDecisionHumana, createdAt: fila.createdAt };
}
