// Persistencia del resultado shadow — Fase 3.4 (interfaz + store en memoria)
// y Fase 3.5 (store durable en Neon, tabla `ShadowMatchLog`).
//
// `PrismaShadowResultStore` es el store por defecto desde Fase 3.5 —
// persiste en la tabla `shadow_match_logs`, sobrevive entre invocaciones
// serverless (a diferencia del store en memoria de Fase 3.4). El motor
// (shadow-runner.ts) y la observabilidad (observability.ts) siguen
// programados contra la interfaz `ShadowResultStore`, no contra Prisma
// directamente — desacoplados a propósito, para poder testear sin Neon y
// para no tener que tocarlos si el backend de persistencia cambia otra vez.
//
// `InMemoryShadowResultStore` se mantiene (no se borra): la usan los tests
// de shadow-runner.ts/observability.ts para no pegarle a Neon, y sigue
// siendo válida como store inyectable en cualquier contexto que prefiera no
// depender de la base real.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { CandidateStatus, ShadowMatchResult, Signal, Blocker, TopCandidateDiagnostico } from "./types";

// Alias deliberado (no solo un re-export): representa el resultado TAL COMO
// QUEDÓ GUARDADO, distinto del resultado recién calculado — hoy son
// idénticos, pero separarlos deja lugar para que el registro persistido
// sume campos propios (ej. un `id` de fila) sin tocar `ShadowMatchResult`.
export type ShadowMatchRecord = ShadowMatchResult;

export interface ShadowResultFilter {
  status?: CandidateStatus;
  engineVersion?: string;
}

export interface ShadowResultStore {
  /**
   * Guarda un resultado. Idempotente por (paymentTransactionId,
   * engineVersion): volver a guardar con la misma clave ACTUALIZA el
   * registro existente — nunca duplica. Un `engineVersion` distinto genera
   * un registro independiente, a propósito (permite comparar cómo cambió el
   * resultado al cambiar el algoritmo).
   */
  guardar(record: ShadowMatchRecord): Promise<void>;
  obtener(paymentTransactionId: string, engineVersion: string): Promise<ShadowMatchRecord | null>;
  listarPorPago(paymentTransactionId: string): Promise<ShadowMatchRecord[]>;
  listar(filtro?: ShadowResultFilter): Promise<ShadowMatchRecord[]>;
}

function claveIdempotencia(paymentTransactionId: string, engineVersion: string): string {
  return `${paymentTransactionId}::${engineVersion}`;
}

export class InMemoryShadowResultStore implements ShadowResultStore {
  private registros = new Map<string, ShadowMatchRecord>();

  async guardar(record: ShadowMatchRecord): Promise<void> {
    this.registros.set(claveIdempotencia(record.paymentTransactionId, record.engineVersion), record);
  }

  async obtener(paymentTransactionId: string, engineVersion: string): Promise<ShadowMatchRecord | null> {
    return this.registros.get(claveIdempotencia(paymentTransactionId, engineVersion)) ?? null;
  }

  async listarPorPago(paymentTransactionId: string): Promise<ShadowMatchRecord[]> {
    return [...this.registros.values()].filter((r) => r.paymentTransactionId === paymentTransactionId);
  }

  async listar(filtro: ShadowResultFilter = {}): Promise<ShadowMatchRecord[]> {
    return [...this.registros.values()].filter(
      (r) =>
        (filtro.status === undefined || r.status === filtro.status) &&
        (filtro.engineVersion === undefined || r.engineVersion === filtro.engineVersion)
    );
  }

  /** Solo para tests — nunca se usa desde código de producción. */
  _clear(): void {
    this.registros.clear();
  }
}

// ----------------------------------------------------------------------------
// PrismaShadowResultStore — Fase 3.5. Backend durable sobre la tabla
// `shadow_match_logs` (Neon). Único archivo que sabe que `ShadowMatchLog`
// existe — shadow-runner.ts/observability.ts siguen programando contra la
// interfaz, sin importar Prisma directamente.
// ----------------------------------------------------------------------------

function aJson(valor: unknown): Prisma.InputJsonValue {
  return valor as Prisma.InputJsonValue;
}

function deFila(fila: {
  paymentTransactionId: string;
  candidateUnitId: string | null;
  candidateUnitOwnerId: string | null;
  candidateObligationId: string | null;
  score: number;
  tier: number | null;
  status: string;
  signals: unknown;
  blockers: unknown;
  explanation: string;
  engineVersion: string;
  evaluatedAt: Date;
  topCandidateScore?: number | null;
  topCandidateTier?: number | null;
  topCandidates?: unknown;
}): ShadowMatchRecord {
  return {
    paymentTransactionId: fila.paymentTransactionId,
    candidateUnitId: fila.candidateUnitId,
    candidateUnitOwnerId: fila.candidateUnitOwnerId,
    candidateObligationId: fila.candidateObligationId,
    score: fila.score,
    tier: fila.tier as ShadowMatchRecord["tier"],
    status: fila.status as CandidateStatus,
    signals: fila.signals as Signal[],
    blockers: fila.blockers as Blocker[],
    explanation: fila.explanation,
    engineVersion: fila.engineVersion,
    evaluatedAt: fila.evaluatedAt.toISOString(),
    // Fase 3.9 — `?? null` porque filas persistidas ANTES de esta fase
    // (columna recién agregada al schema, migración todavía sin aplicar)
    // no van a traer estos campos — se leen como `null`, nunca `undefined`,
    // manteniendo compatibilidad con lo ya persistido.
    topCandidateScore: fila.topCandidateScore ?? null,
    topCandidateTier: (fila.topCandidateTier as ShadowMatchRecord["tier"]) ?? null,
    // Fase 5.1 — mismo criterio de compatibilidad: filas persistidas antes
    // de esta columna no la traen, se leen como `null`, nunca `undefined`.
    topCandidates: (fila.topCandidates as TopCandidateDiagnostico[] | undefined) ?? null,
  };
}

export class PrismaShadowResultStore implements ShadowResultStore {
  /**
   * Upsert por (paymentTransactionId, engineVersion) — la misma clave de
   * idempotencia que ya usaba InMemoryShadowResultStore, ahora respaldada
   * por el `@@unique` real de la migración. Reevaluar la misma versión
   * ACTUALIZA la fila existente (incluido `updatedAt`); nunca duplica.
   */
  async guardar(record: ShadowMatchRecord): Promise<void> {
    const datosComunes = {
      candidateUnitId: record.candidateUnitId,
      candidateUnitOwnerId: record.candidateUnitOwnerId,
      candidateObligationId: record.candidateObligationId,
      score: record.score,
      tier: record.tier,
      status: record.status,
      topCandidateScore: record.topCandidateScore,
      topCandidateTier: record.topCandidateTier,
      topCandidates: record.topCandidates === null ? Prisma.DbNull : aJson(record.topCandidates),
      signals: aJson(record.signals),
      blockers: aJson(record.blockers),
      explanation: record.explanation,
      evaluatedAt: new Date(record.evaluatedAt),
    };

    await prisma.shadowMatchLog.upsert({
      where: {
        paymentTransactionId_engineVersion: {
          paymentTransactionId: record.paymentTransactionId,
          engineVersion: record.engineVersion,
        },
      },
      create: {
        paymentTransactionId: record.paymentTransactionId,
        engineVersion: record.engineVersion,
        ...datosComunes,
      },
      update: datosComunes,
    });
  }

  async obtener(paymentTransactionId: string, engineVersion: string): Promise<ShadowMatchRecord | null> {
    const fila = await prisma.shadowMatchLog.findUnique({
      where: { paymentTransactionId_engineVersion: { paymentTransactionId, engineVersion } },
    });
    return fila ? deFila(fila) : null;
  }

  async listarPorPago(paymentTransactionId: string): Promise<ShadowMatchRecord[]> {
    const filas = await prisma.shadowMatchLog.findMany({ where: { paymentTransactionId } });
    return filas.map(deFila);
  }

  async listar(filtro: ShadowResultFilter = {}): Promise<ShadowMatchRecord[]> {
    const filas = await prisma.shadowMatchLog.findMany({
      where: {
        status: filtro.status,
        engineVersion: filtro.engineVersion,
      },
    });
    return filas.map(deFila);
  }
}

// Store por defecto desde Fase 3.5 — durable en Neon. `shadow-runner.ts` y
// `observability.ts` lo usan por defecto, pero ambos aceptan una instancia
// distinta como parámetro (inyección simple) para poder testear con un
// `InMemoryShadowResultStore` aislado, sin pegarle nunca a Neon en tests.
export const defaultShadowResultStore: ShadowResultStore = new PrismaShadowResultStore();
