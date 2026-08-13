// Persistencia del resultado de evidence-score.ts — Fase 5.9, HISTORIAL
// INMUTABLE desde Fase 5.9.1 (corrige el hallazgo de
// FASE_5_9_1_AUDITORIA_SEMANTICA.md: la versión original hacía upsert por
// (paymentTransactionId, engineVersion), que era last-write-wins — perdía
// evaluaciones anteriores, lo cual NO sirve para calibrar el sistema antes
// de AUTO). Mismo patrón general que shadow-store.ts (interfaz desacoplada
// de Prisma, store en memoria para tests, store durable para
// producción/dev-fixtures) — pero `guardar()` ahora SIEMPRE inserta una
// fila nueva, nunca actualiza ni sobrescribe.
//
// IDENTIDAD DE CADA EVALUACIÓN (Fase 5.9.1): el `id` (cuid) de la fila —
// nada más. `paymentTransactionId`+`engineVersion` ya NO son una clave de
// deduplicación (el `@@unique` se removió en la migración
// `payment_evidence_append_only_history`) — son atributos descriptivos para
// AGRUPAR y FILTRAR el historial, nunca para decidir si una escritura
// "ya existe". Evaluar dos veces el mismo pago con la misma versión produce
// DOS filas, ambas conservadas para siempre — nunca UPDATE, nunca DELETE.
//
// IDEMPOTENCIA ≠ HISTORIAL (pedido explícito de Fase 5.9.1): este store no
// implementa ninguna idempotencia — cada llamada a guardar() es un evento
// genuino que se registra tal cual. Si en el futuro hiciera falta detectar
// reintentos accidentales del mismo trigger (ej. un webhook reentregado),
// esa lógica debe vivir en el CALLER (comparando timestamps/orígenes) o en
// un campo aditivo nuevo — nunca reemplazando una fila existente ni
// evitando que un evento genuino se registre.
//
// Decisión arquitectónica ShadowMatchLog vs. PaymentEvidenceAssessmentLog
// (ver FASE_5_9_IMPLEMENTACION_FINAL.md / FASE_5_9_1_IMPLEMENTACION_FINAL.md):
// ShadowMatchLog sigue siendo la única fuente de verdad de "qué candidato
// encontró el motor bancario y con qué señales" EN SU FORMA VIGENTE (upsert,
// una fila por versión) — no se duplica ni se convierte acá en historial.
// PaymentEvidenceAssessmentLog persiste una pregunta DISTINTA, como
// historial: "¿cuánta evidencia independiente había, y qué estado le asignó
// evidence-score.ts, EN ESTE MOMENTO PUNTUAL?" — y desde Fase 5.9.1 incluye
// un snapshot estructurado (`structuredEvidence`) capturado en el momento,
// para poder auditar cada evento sin volver a leer ShadowMatchLog después.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { Blocker, Signal, TopCandidateDiagnostico } from "@/lib/reconciliation/types";
import type { EvidenceFamilyName, EvidenceFamilyResult, PaymentEvidenceState } from "./evidence-score";

/**
 * Snapshot ESTRUCTURADO (no solo texto) de la evidencia detrás de esta
 * evaluación puntual, capturado directamente del ShadowMatchResult ya
 * calculado — nunca releído de ShadowMatchLog. Ver comentario del campo
 * `structuredEvidence` en schema.prisma para el razonamiento completo de
 * qué se incluye y qué deliberadamente no.
 */
export interface StructuredEvidenceSnapshot {
  bank: {
    signals: Signal[];
    blockers: Blocker[];
    topCandidates: TopCandidateDiagnostico[] | null;
  } | null;
  whatsapp: {
    signals: Signal[];
    blockers: Blocker[];
  } | null;
}

export interface PaymentEvidenceAssessmentRecord {
  id?: string; // ausente al guardar (lo asigna la base); presente al leer
  paymentTransactionId: string;
  engineVersion: string;
  state: PaymentEvidenceState;
  candidateUnitId: string | null;
  families: EvidenceFamilyResult[];
  independentFamiliesConverging: EvidenceFamilyName[];
  hasContradiction: boolean;
  contradictionDetail: string | null;
  explanation: string;
  structuredEvidence: StructuredEvidenceSnapshot | null;
  evaluatedAt: string; // ISO
  createdAt?: string; // ISO — momento real de persistencia; ausente al guardar
}

export interface PaymentEvidenceAssessmentFilter {
  state?: PaymentEvidenceState;
  engineVersion?: string;
}

export interface PaymentEvidenceAssessmentStore {
  /**
   * Registra UN evento histórico — SIEMPRE inserta una fila nueva, nunca
   * actualiza ni sobrescribe ninguna fila existente. Reevaluar el mismo
   * (paymentTransactionId, engineVersion) produce un segundo registro
   * independiente, no un reemplazo del primero.
   */
  guardar(record: PaymentEvidenceAssessmentRecord): Promise<void>;
  /** La evaluación MÁS RECIENTE para (pago, versión) — no "la única", la última de posiblemente varias. */
  obtenerUltima(paymentTransactionId: string, engineVersion: string): Promise<PaymentEvidenceAssessmentRecord | null>;
  /** Historial COMPLETO de un pago (todas las versiones y todas las reevaluaciones), ordenado cronológicamente ascendente. */
  listarHistorialPorPago(paymentTransactionId: string): Promise<PaymentEvidenceAssessmentRecord[]>;
  listar(filtro?: PaymentEvidenceAssessmentFilter): Promise<PaymentEvidenceAssessmentRecord[]>;
}

export class InMemoryPaymentEvidenceAssessmentStore implements PaymentEvidenceAssessmentStore {
  private registros: (PaymentEvidenceAssessmentRecord & { id: string; createdAt: string })[] = [];
  private contador = 0;

  async guardar(record: PaymentEvidenceAssessmentRecord): Promise<void> {
    this.contador++;
    this.registros.push({ ...record, id: `mem-${this.contador}`, createdAt: new Date().toISOString() });
  }

  async obtenerUltima(paymentTransactionId: string, engineVersion: string): Promise<PaymentEvidenceAssessmentRecord | null> {
    const coincidencias = this.registros.filter((r) => r.paymentTransactionId === paymentTransactionId && r.engineVersion === engineVersion);
    if (coincidencias.length === 0) return null;
    return coincidencias.reduce((ultima, actual) => (actual.createdAt > ultima.createdAt ? actual : ultima));
  }

  async listarHistorialPorPago(paymentTransactionId: string): Promise<PaymentEvidenceAssessmentRecord[]> {
    return this.registros.filter((r) => r.paymentTransactionId === paymentTransactionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listar(filtro: PaymentEvidenceAssessmentFilter = {}): Promise<PaymentEvidenceAssessmentRecord[]> {
    return this.registros.filter(
      (r) =>
        (filtro.state === undefined || r.state === filtro.state) &&
        (filtro.engineVersion === undefined || r.engineVersion === filtro.engineVersion)
    );
  }

  /** Solo para tests — nunca se usa desde código de producción. */
  _clear(): void {
    this.registros = [];
    this.contador = 0;
  }

  /** Solo para tests — inspección directa de cuántos eventos históricos hay. */
  _todos(): readonly PaymentEvidenceAssessmentRecord[] {
    return this.registros;
  }
}

function aJson(valor: unknown): Prisma.InputJsonValue {
  return valor as Prisma.InputJsonValue;
}

// Denormaliza `candidateUnitId` desde `families` — BANK_MOVEMENT primero, si
// no WHATSAPP_MESSAGE — nunca se inventa, solo se lee lo que evidence-score.ts
// ya calculó. Ver comentario del campo en schema.prisma. Exportada para que
// el runner (evidence-score-runner.ts) arme el mismo valor al construir el
// record — una sola implementación, nunca dos cálculos que puedan divergir.
export function candidatoUnitIdDesdeFamilias(families: EvidenceFamilyResult[]): string | null {
  const banco = families.find((f) => f.family === "BANK_MOVEMENT");
  if (banco?.unitId) return banco.unitId;
  const whatsapp = families.find((f) => f.family === "WHATSAPP_MESSAGE");
  return whatsapp?.unitId ?? null;
}

function deFila(fila: {
  id: string;
  paymentTransactionId: string;
  engineVersion: string;
  state: string;
  candidateUnitId: string | null;
  families: unknown;
  independentFamiliesConverging: unknown;
  hasContradiction: boolean;
  contradictionDetail: string | null;
  explanation: string;
  structuredEvidence: unknown;
  evaluatedAt: Date;
  createdAt: Date;
}): PaymentEvidenceAssessmentRecord {
  return {
    id: fila.id,
    paymentTransactionId: fila.paymentTransactionId,
    engineVersion: fila.engineVersion,
    state: fila.state as PaymentEvidenceState,
    candidateUnitId: fila.candidateUnitId,
    families: fila.families as EvidenceFamilyResult[],
    independentFamiliesConverging: fila.independentFamiliesConverging as EvidenceFamilyName[],
    hasContradiction: fila.hasContradiction,
    contradictionDetail: fila.contradictionDetail,
    explanation: fila.explanation,
    // Filas anteriores a Fase 5.9.1 no tienen este campo (columna nueva,
    // nullable a propósito — ver schema.prisma) — se leen como `null`,
    // nunca `undefined`, mismo criterio de compatibilidad ya usado en
    // ShadowMatchLog para topCandidateScore/topCandidates.
    structuredEvidence: (fila.structuredEvidence as StructuredEvidenceSnapshot | null) ?? null,
    evaluatedAt: fila.evaluatedAt.toISOString(),
    createdAt: fila.createdAt.toISOString(),
  };
}

export class PrismaPaymentEvidenceAssessmentStore implements PaymentEvidenceAssessmentStore {
  /**
   * SIEMPRE `create` — nunca `upsert`, nunca `update`. Cada llamada es un
   * evento histórico nuevo e independiente, aunque `paymentTransactionId` +
   * `engineVersion` coincidan exactamente con una fila ya existente.
   */
  async guardar(record: PaymentEvidenceAssessmentRecord): Promise<void> {
    await prisma.paymentEvidenceAssessmentLog.create({
      data: {
        paymentTransactionId: record.paymentTransactionId,
        engineVersion: record.engineVersion,
        state: record.state,
        candidateUnitId: candidatoUnitIdDesdeFamilias(record.families),
        families: aJson(record.families),
        independentFamiliesConverging: aJson(record.independentFamiliesConverging),
        hasContradiction: record.hasContradiction,
        contradictionDetail: record.contradictionDetail,
        explanation: record.explanation,
        structuredEvidence: record.structuredEvidence === null ? Prisma.DbNull : aJson(record.structuredEvidence),
        evaluatedAt: new Date(record.evaluatedAt),
      },
    });
  }

  async obtenerUltima(paymentTransactionId: string, engineVersion: string): Promise<PaymentEvidenceAssessmentRecord | null> {
    const fila = await prisma.paymentEvidenceAssessmentLog.findFirst({
      where: { paymentTransactionId, engineVersion },
      orderBy: { createdAt: "desc" },
    });
    return fila ? deFila(fila) : null;
  }

  async listarHistorialPorPago(paymentTransactionId: string): Promise<PaymentEvidenceAssessmentRecord[]> {
    const filas = await prisma.paymentEvidenceAssessmentLog.findMany({
      where: { paymentTransactionId },
      orderBy: { createdAt: "asc" },
    });
    return filas.map(deFila);
  }

  async listar(filtro: PaymentEvidenceAssessmentFilter = {}): Promise<PaymentEvidenceAssessmentRecord[]> {
    const filas = await prisma.paymentEvidenceAssessmentLog.findMany({
      where: { state: filtro.state, engineVersion: filtro.engineVersion },
      orderBy: { createdAt: "asc" },
    });
    return filas.map(deFila);
  }
}

// Store por defecto — durable en la base configurada. Mismo criterio que
// defaultShadowResultStore: nunca escribe ReconciliationMatch, nunca toca
// PaymentTransaction/Obligation/Unit/UnitOwner — la tabla que sí escribe
// (`payment_evidence_assessment_logs`) es puramente diagnóstica, ahora
// además append-only real.
export const defaultPaymentEvidenceAssessmentStore: PaymentEvidenceAssessmentStore = new PrismaPaymentEvidenceAssessmentStore();
