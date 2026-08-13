// Agent OS — Fase 4 Parte D. Tipos compartidos por CUALQUIER agente futuro
// (Compliance hoy; Matching/Expensas/Vencimientos/Cobranzas después) — ver
// FASE_4_PARTE_D_PLAN.md §1-2 para por qué esta es la ÚNICA abstracción
// nueva de esta fase (no Agent/AgentRun/AgentProposal/AgentPolicy/
// AgentAction/AgentAudit todavía).
//
// Una ObservacionAgente es PURA OBSERVACIÓN — nunca una acción. Ningún
// campo de acá ejecuta nada: `suggestedAction` es texto legible, no una
// función ni una referencia a algo ejecutable.

export type AgentType = "COMPLIANCE" | "MATCHING";

export type AgentObservationType =
  | "DOCUMENT_EXPIRED"
  | "DOCUMENT_EXPIRING_SOON"
  | "PROVIDER_WITHOUT_DOCUMENTS"
  // Fase 4.F — origen Motor de Matching (ver
  // src/lib/reconciliation/matching-observer.ts). Deliberadamente NO existe
  // un tipo para CANDIDATE — un match limpio no es un problema, se reporta
  // agregado en el resumen ejecutivo del panel, nunca como observación.
  | "PAYMENT_MATCH_BLOCKED"
  | "PAYMENT_MATCH_AMBIGUOUS";

export type AgentObservationSeverity = "INFO" | "WARNING" | "CRITICAL";

export type AgentObservationStatus = "OPEN" | "RESOLVED";

/** Lo que un detector arma ANTES de persistir. */
export interface ObservacionAgente {
  agentType: AgentType;
  type: AgentObservationType;
  severity: AgentObservationSeverity;

  // FKs explícitas nullable — nunca entityType/entityId polimórfico (mismo
  // patrón ya exigido en Compliance Foundation). Un agente futuro que
  // necesite referenciar otra entidad (ej. Obligation) suma su propia
  // columna nullable vía una migración aditiva — nunca un campo genérico.
  providerId: string | null;
  providerDocumentId: string | null;
  organizationId: string | null;
  // Fase 4.F — null para observaciones de Compliance (no se originan en un
  // pago); poblado por matching-observer.ts con el pago real que originó la
  // observación.
  paymentTransactionId: string | null;

  explanation: string; // por qué existe, legible por un humano
  evidence: Record<string, unknown>; // datos reales que la sustentan — nunca inventados
  suggestedAction: string | null; // texto — NUNCA una acción ejecutable
  source: string; // qué regla determinística la generó (ej. "compliance:document-expiry")
  confidence: number | null; // reservado para observaciones futuras asistidas por IA — null en detección determinística

  // Idempotencia — calculada por el detector, no por el store.
  dedupeKey: string;
  detectedAt: string; // ISO — cuándo se detectó por primera vez esta condición
}

/** Lo mismo, ya persistido. */
export interface ObservacionAgentePersistida extends ObservacionAgente {
  id: string;
  status: AgentObservationStatus;
  createdAt: string;
  updatedAt: string;
}
