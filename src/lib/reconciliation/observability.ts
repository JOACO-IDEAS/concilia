// Observabilidad del modo sombra — Fase 3.4
// (FASE_3_4_IMPLEMENTATION_PLAN.md §8/§9). Funciones de consulta puras
// (más una enriquecida con lecturas de solo lectura a Prisma para mostrar
// nombre/código real del candidato) — todavía no hay UI, "puede ser
// inicialmente... función de consulta" (pedido explícito). Envolver esto en
// un Server Action para una futura pantalla es trivial y no forma parte de
// esta fase.

import { prisma } from "@/lib/prisma";
import type { CandidateStatus, SignalName, BlockerType } from "./types";
import { defaultShadowResultStore, type ShadowMatchRecord, type ShadowResultFilter, type ShadowResultStore } from "./shadow-store";

export interface CandidateContext {
  unitCode: string | null;
  ownerFullName: string | null;
  obligationPeriod: string | null; // "2026-08"
  obligationSaldo: number | null;
}

/**
 * Enriquece un resultado shadow con el nombre/código real del candidato —
 * SOLO LECTURA sobre Unit/UnitOwner/Obligation (tablas que ya existen desde
 * Fase 1/3.2, sin relación con la migración pendiente de ShadowMatchLog).
 */
export async function resolverContextoCandidato(record: ShadowMatchRecord): Promise<CandidateContext> {
  const [unit, owner, obligation] = await Promise.all([
    record.candidateUnitId
      ? prisma.unit.findUnique({ where: { id: record.candidateUnitId }, select: { code: true } })
      : null,
    record.candidateUnitOwnerId
      ? prisma.unitOwner.findUnique({ where: { id: record.candidateUnitOwnerId }, select: { fullName: true } })
      : null,
    record.candidateObligationId
      ? prisma.obligation.findUnique({
          where: { id: record.candidateObligationId },
          select: { period: true, amount: true, paidAmount: true },
        })
      : null,
  ]);

  return {
    unitCode: unit?.code ?? null,
    ownerFullName: owner?.fullName ?? null,
    obligationPeriod: obligation ? obligation.period.toISOString().slice(0, 7) : null,
    obligationSaldo: obligation ? obligation.amount.toNumber() - obligation.paidAmount.toNumber() : null,
  };
}

/** Formato humano — el mismo pedido explícitamente, construido directamente desde el resultado real, nunca inventado. */
export function formatearResultadoShadow(
  record: ShadowMatchRecord,
  contexto: CandidateContext | null,
  etiquetaPago?: string
): string {
  const lineas: string[] = [`Pago ${etiquetaPago ?? record.paymentTransactionId}`, "", record.explanation, ""];
  lineas.push(`Confianza: ${record.score}%`);
  lineas.push(`Estado: ${record.status}`);
  lineas.push(`Bloqueos: ${record.blockers.length === 0 ? "ninguno" : record.blockers.map((b) => b.evidence).join("; ")}`);

  // Fase 3.9 — diagnóstico, solo cuando aporta algo que "Confianza" no dice
  // ya (status distinto de CANDIDATE y hubo al menos un candidato real).
  if (record.status !== "CANDIDATE" && record.topCandidateScore !== null) {
    lineas.push(
      `Mejor candidato evaluado (no elegible): ${record.topCandidateScore}%${record.topCandidateTier ? ` — tier ${record.topCandidateTier}` : ""}`
    );
  }

  if (contexto && (contexto.unitCode || contexto.ownerFullName || contexto.obligationPeriod)) {
    lineas.push("", "Candidato:");
    if (contexto.unitCode) lineas.push(`UF ${contexto.unitCode}`);
    if (contexto.ownerFullName) lineas.push(`Titular: ${contexto.ownerFullName}`);
    if (contexto.obligationPeriod) lineas.push(`Obligación: ${contexto.obligationPeriod}`);
    if (contexto.obligationSaldo !== null) lineas.push(`Saldo: $${contexto.obligationSaldo}`);
  }

  lineas.push("", `Motor: ${record.engineVersion} — evaluado ${record.evaluatedAt}`);
  return lineas.join("\n");
}

/** Trae el resultado más reciente de un pago (o el de una `engineVersion` puntual) ya formateado. `null` si nunca se evaluó. */
export async function obtenerResultadoShadowFormateado(
  paymentTransactionId: string,
  opciones: { engineVersion?: string; store?: ShadowResultStore } = {}
): Promise<string | null> {
  const store = opciones.store ?? defaultShadowResultStore;
  const registros = await store.listarPorPago(paymentTransactionId);
  if (registros.length === 0) return null;

  const record = opciones.engineVersion
    ? (registros.find((r) => r.engineVersion === opciones.engineVersion) ?? null)
    : registros.reduce((masReciente, r) => (r.evaluatedAt > masReciente.evaluatedAt ? r : masReciente));
  if (!record) return null;

  const contexto = record.status === "CANDIDATE" ? await resolverContextoCandidato(record) : null;
  return formatearResultadoShadow(record, contexto);
}

// ----------------------------------------------------------------------------
// Métricas — RECONCILIATION_MATCHING_ARCHITECTURE.md / pedido §9. Sin
// dashboard todavía: la información queda disponible para construirlo
// después, calculada a partir de lo que ya devuelve `store.listar()`.
// ----------------------------------------------------------------------------

export interface ShadowMetrics {
  totalEvaluados: number;
  porStatus: Record<CandidateStatus, number>;
  sinEvidencia: number;
  confianzaPromedio: number; // promedio de `score` sobre todos los registros — 0 si no hay ninguno
  distribucionScore: { rango: string; cantidad: number }[];
  distribucionTier: Record<string, number>;
  senalesFrecuentes: Partial<Record<SignalName, number>>;
  bloqueosFrecuentes: Partial<Record<BlockerType, number>>;
  // Fase 3.5 — cuántos resultados persistidos corresponden a cada versión
  // del motor (MATCH_ENGINE_VERSION en el momento del cálculo). Necesario
  // para poder comparar, más adelante, cómo cambió la distribución de
  // resultados al recalibrar pesos/reglas entre una versión y la siguiente.
  porEngineVersion: Record<string, number>;
  // Fase 3.9 — distribución de `topCandidateScore` (diagnóstico, ver
  // types.ts) ÚNICAMENTE entre los registros BLOCKED. Responde preguntas
  // como "¿cuántos BLOCKED tenían igual un candidato con score 90+?" sumando
  // los buckets correspondientes — sin hardcodear ningún umbral acá, mismo
  // criterio que `distribucionScore`. Los BLOCKED sin ningún candidato
  // evaluado (`topCandidateScore=null`, ej. NO_UNITS_IN_ORGANIZATION) se
  // cuentan aparte, en `sinCandidatoEvaluado` — nunca mezclados con "score 0".
  distribucionTopCandidateScoreBlocked: { rango: string; cantidad: number }[];
  blockedSinCandidatoEvaluado: number;
}

export function calcularMetricas(records: ShadowMatchRecord[]): ShadowMetrics {
  const porStatus: Record<CandidateStatus, number> = { CANDIDATE: 0, AMBIGUOUS: 0, BLOCKED: 0 };
  let sinEvidencia = 0;
  let sumaScore = 0;
  const bucketsScore = new Map<string, number>();
  const distribucionTier: Record<string, number> = {};
  const senalesFrecuentes: Partial<Record<SignalName, number>> = {};
  const bloqueosFrecuentes: Partial<Record<BlockerType, number>> = {};
  const porEngineVersion: Record<string, number> = {};
  const bucketsTopCandidateBlocked = new Map<string, number>();
  let blockedSinCandidatoEvaluado = 0;

  for (const r of records) {
    porStatus[r.status]++;
    if (r.blockers.some((b) => b.type === "INSUFFICIENT_EVIDENCE")) sinEvidencia++;
    sumaScore += r.score;

    const base = Math.floor(r.score / 10) * 10;
    const bucket = `${base}-${base + 9}`;
    bucketsScore.set(bucket, (bucketsScore.get(bucket) ?? 0) + 1);

    const tierKey = r.tier === null ? "sin_tier" : String(r.tier);
    distribucionTier[tierKey] = (distribucionTier[tierKey] ?? 0) + 1;

    for (const s of r.signals) {
      if (s.matched) senalesFrecuentes[s.signal] = (senalesFrecuentes[s.signal] ?? 0) + 1;
    }
    for (const b of r.blockers) {
      bloqueosFrecuentes[b.type] = (bloqueosFrecuentes[b.type] ?? 0) + 1;
    }

    porEngineVersion[r.engineVersion] = (porEngineVersion[r.engineVersion] ?? 0) + 1;

    if (r.status === "BLOCKED") {
      if (r.topCandidateScore === null) {
        blockedSinCandidatoEvaluado++;
      } else {
        const baseTop = Math.floor(r.topCandidateScore / 10) * 10;
        const bucketTop = `${baseTop}-${baseTop + 9}`;
        bucketsTopCandidateBlocked.set(bucketTop, (bucketsTopCandidateBlocked.get(bucketTop) ?? 0) + 1);
      }
    }
  }

  return {
    totalEvaluados: records.length,
    porStatus,
    sinEvidencia,
    confianzaPromedio: records.length === 0 ? 0 : sumaScore / records.length,
    distribucionScore: [...bucketsScore.entries()]
      .sort(([a], [b]) => Number(a.split("-")[0]) - Number(b.split("-")[0]))
      .map(([rango, cantidad]) => ({ rango, cantidad })),
    distribucionTier,
    senalesFrecuentes,
    bloqueosFrecuentes,
    porEngineVersion,
    distribucionTopCandidateScoreBlocked: [...bucketsTopCandidateBlocked.entries()]
      .sort(([a], [b]) => Number(a.split("-")[0]) - Number(b.split("-")[0]))
      .map(([rango, cantidad]) => ({ rango, cantidad })),
    blockedSinCandidatoEvaluado,
  };
}

export async function obtenerMetricas(
  filtro: ShadowResultFilter = {},
  store: ShadowResultStore = defaultShadowResultStore
): Promise<ShadowMetrics> {
  return calcularMetricas(await store.listar(filtro));
}
