"use server";

// Fase 5.12 — Server Actions de la bandeja de revisión humana real
// (/conciliacion/revision-humana). ÚNICA escritura funcional de esta fase:
// `registrarDecisionHumana()` (Fase 5.8, sin cambios) — nunca toca
// PaymentTransaction, Obligation, Unit ni UnitOwner. Sin AUTO en ningún
// camino: `decision` siempre viene fijo en el código (APPROVED/REJECTED),
// nunca de un parámetro externo.
//
// El `reason`/`rejectionReason` que se escribe acá es texto real, sin
// ninguno de los marcadores que decision-provenance.ts (Fase 5.11) reconoce
// como sintéticos ("SINTÉTICA", "[SYNTHETIC_DEMO]") — por diseño: una
// decisión tomada desde esta pantalla por un administrador real debe
// clasificarse ORGANIC automáticamente, sin ningún flag adicional que
// alguien tenga que recordar setear.
//
// GUARDIA DE ENTORNO (pedido explícito del usuario, posterior a la primera
// versión de esta fase): "jamás etiquetar una decisión sobre fixtures como
// ORGANIC ni utilizarla como evidencia real de calibración" — no alcanza con
// que el texto esté "limpio": el ENTORNO conectado también importa. Se
// reutiliza `detectarEntornoPorHost`/`extraerHost` (Fase 5.9, mismo módulo
// puro que ya usa la guardia de `prisma.config.ts` y el preflight) para
// determinar, en cada escritura, si la conexión activa es realmente
// producción. Solo una decisión escrita mientras el entorno detectado es
// POSITIVAMENTE "production" queda con el texto limpio (ORGANIC-elegible).
// Cualquier otro caso — "fixtures", o "unknown" (ambiguo, igual que la
// guardia de migraciones nunca asume un default) — inserta automáticamente
// el marcador `[SYNTHETIC_DEMO]` ya reconocido por decision-provenance.ts,
// sin que quien usa la pantalla tenga que acordarse de nada.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrarDecisionHumana } from "@/lib/reconciliation/human-decision";
import { filtrarCasosAmbiguos, filtrarCasosRevisables, type CasoAmbiguo, type CasoRevisable, type DecisionCruda, type EvaluacionCruda } from "@/lib/reconciliation/review-queue";
import type { EvidenceFamilyResult, PaymentEvidenceState } from "@/lib/payment-evidence/evidence-score";
import type { StructuredEvidenceSnapshot } from "@/lib/payment-evidence/evidence-score-store";
import type { Signal } from "@/lib/reconciliation/types";
import { detectarEntornoPorHost, extraerHost, resolverDatasourceUrlDesdeEnv, type EntornoPrisma } from "@/lib/prisma-safety/entornos";
import { MARCADOR_DECISION_SINTETICA_DEMO } from "@/lib/calibration/decision-provenance";
import { requireOrganizationAccess } from "@/lib/auth/organization-access";
import { requireCurrentAdministrator } from "@/lib/auth/session";
import { appendProductEventSafely } from "@/lib/product-observability/runtime";

const PATH = "/conciliacion/revision-humana";

function entornoActualSincrono(): EntornoPrisma {
  return detectarEntornoPorHost(extraerHost(resolverDatasourceUrlDesdeEnv()));
}

/** `true` únicamente cuando el entorno conectado se identifica POSITIVAMENTE como producción — nunca por descarte. Async porque Next.js exige que toda función exportada de un archivo "use server" lo sea. */
export async function entornoActual(): Promise<EntornoPrisma> {
  return entornoActualSincrono();
}

function esEntornoDeProduccionConfirmado(): boolean {
  return entornoActualSincrono() === "production";
}

/** Antepone el marcador de test cuando el entorno NO es producción confirmada — la única forma de que una decisión termine ORGANIC es escribirse desde producción real. */
function reasonSegunEntorno(reasonReal: string): string {
  if (esEntornoDeProduccionConfirmado()) return reasonReal;
  return `${MARCADOR_DECISION_SINTETICA_DEMO} (entorno=${entornoActualSincrono()}, nunca cuenta como evidencia real) — ${reasonReal}`;
}

export interface CasoRevisableDTO extends CasoRevisable {
  amount: number;
  currency: string;
  transactionDate: string | null;
  payerIdentifier: string | null;
  referenceNumber: string | null;
  concept: string | null;
  unitCode: string;
  organizationName: string;
}

/**
 * Lee TODAS las evaluaciones reales + decisiones reales, filtra con
 * review-queue.ts (puro), y enriquece SOLO los casos revisables con los
 * datos de pago/unidad que la UI necesita mostrar — nunca recalcula nada
 * del motor, nunca escribe. Solo lectura.
 */
export async function listarCasosRevisablesAction(): Promise<CasoRevisableDTO[]> {
  const administrator = await requireCurrentAdministrator();
  const [filasEvaluaciones, filasDecisiones] = await Promise.all([
    prisma.paymentEvidenceAssessmentLog.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.reconciliationMatch.findMany({ select: { paymentTransactionId: true, unitId: true, decision: true } }),
  ]);

  const evaluaciones: EvaluacionCruda[] = filasEvaluaciones.map((f) => ({
    id: f.id,
    paymentTransactionId: f.paymentTransactionId,
    state: f.state as PaymentEvidenceState,
    candidateUnitId: f.candidateUnitId,
    families: f.families as unknown as EvidenceFamilyResult[],
    hasContradiction: f.hasContradiction,
    contradictionDetail: f.contradictionDetail,
    explanation: f.explanation,
    structuredEvidence: (f.structuredEvidence as StructuredEvidenceSnapshot | null) ?? null,
    evaluatedAt: f.evaluatedAt.toISOString(),
  }));

  const decisiones: DecisionCruda[] = filasDecisiones.map((d) => ({ paymentTransactionId: d.paymentTransactionId, unitId: d.unitId, decision: d.decision }));

  const revisables = filtrarCasosRevisables(evaluaciones, decisiones);
  if (revisables.length === 0) return [];

  const pagos = await prisma.paymentTransaction.findMany({
    where: { id: { in: revisables.map((c) => c.paymentTransactionId) }, organization: { administrators: { some: { administratorId: administrator.id } } } },
    select: { id: true, amount: true, currency: true, transactionDate: true, payerIdentifier: true, referenceNumber: true, concept: true },
  });
  const pagoPorId = new Map(pagos.map((p) => [p.id, p]));

  const unidades = await prisma.unit.findMany({
    where: { id: { in: revisables.map((c) => c.candidateUnitId) }, organization: { administrators: { some: { administratorId: administrator.id } } } },
    select: { id: true, code: true, organization: { select: { name: true } } },
  });
  const unidadPorId = new Map(unidades.map((u) => [u.id, u]));

  const resultado: CasoRevisableDTO[] = [];
  for (const caso of revisables) {
    const pago = pagoPorId.get(caso.paymentTransactionId);
    const unidad = unidadPorId.get(caso.candidateUnitId);
    if (!pago || !unidad) continue; // dato real inconsistente (borrado entre evaluación y ahora) — se omite, nunca se inventa
    resultado.push({
      ...caso,
      amount: pago.amount.toNumber(),
      currency: pago.currency,
      transactionDate: pago.transactionDate ? pago.transactionDate.toISOString() : null,
      payerIdentifier: pago.payerIdentifier,
      referenceNumber: pago.referenceNumber,
      concept: pago.concept,
      unitCode: unidad.code,
      organizationName: unidad.organization.name,
    });
  }
  return resultado;
}

export interface CasoAmbiguoDTO extends CasoAmbiguo {
  amount: number;
  currency: string;
  transactionDate: string | null;
  payerIdentifier: string | null;
  referenceNumber: string | null;
  concept: string | null;
  organizationName: string;
}

/**
 * Fase 5.13 — mismo patrón de `listarCasosRevisablesAction`, camino
 * separado: casos NEEDS_DECISION por ambigüedad (`filtrarCasosAmbiguos`,
 * review-queue.ts), enriquecidos con los datos de pago que la UI necesita.
 * Nunca se mezcla con `listarCasosRevisablesAction` — ningún pago puede
 * aparecer en las dos listas a la vez (son estructuralmente excluyentes,
 * `candidateUnitId` presente vs. null). Solo lectura.
 */
export async function listarCasosAmbiguosAction(): Promise<CasoAmbiguoDTO[]> {
  const administrator = await requireCurrentAdministrator();
  const [filasEvaluaciones, filasDecisiones] = await Promise.all([
    prisma.paymentEvidenceAssessmentLog.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.reconciliationMatch.findMany({ select: { paymentTransactionId: true, unitId: true, decision: true } }),
  ]);

  const evaluaciones: EvaluacionCruda[] = filasEvaluaciones.map((f) => ({
    id: f.id,
    paymentTransactionId: f.paymentTransactionId,
    state: f.state as PaymentEvidenceState,
    candidateUnitId: f.candidateUnitId,
    families: f.families as unknown as EvidenceFamilyResult[],
    hasContradiction: f.hasContradiction,
    contradictionDetail: f.contradictionDetail,
    explanation: f.explanation,
    structuredEvidence: (f.structuredEvidence as StructuredEvidenceSnapshot | null) ?? null,
    evaluatedAt: f.evaluatedAt.toISOString(),
  }));

  const decisiones: DecisionCruda[] = filasDecisiones.map((d) => ({ paymentTransactionId: d.paymentTransactionId, unitId: d.unitId, decision: d.decision }));

  const ambiguos = filtrarCasosAmbiguos(evaluaciones, decisiones);
  if (ambiguos.length === 0) return [];

  const pagos = await prisma.paymentTransaction.findMany({
    where: { id: { in: ambiguos.map((c) => c.paymentTransactionId) }, organization: { administrators: { some: { administratorId: administrator.id } } } },
    select: { id: true, amount: true, currency: true, transactionDate: true, payerIdentifier: true, referenceNumber: true, concept: true, organization: { select: { name: true } } },
  });
  const pagoPorId = new Map(pagos.map((p) => [p.id, p]));

  const resultado: CasoAmbiguoDTO[] = [];
  for (const caso of ambiguos) {
    const pago = pagoPorId.get(caso.paymentTransactionId);
    if (!pago || !pago.organization) continue; // dato real inconsistente — se omite, nunca se inventa
    resultado.push({
      ...caso,
      amount: pago.amount.toNumber(),
      currency: pago.currency,
      transactionDate: pago.transactionDate ? pago.transactionDate.toISOString() : null,
      payerIdentifier: pago.payerIdentifier,
      referenceNumber: pago.referenceNumber,
      concept: pago.concept,
      organizationName: pago.organization.name,
    });
  }
  return resultado;
}

function signalsMatcheadasDelCandidato(structuredEvidence: StructuredEvidenceSnapshot | null): Signal[] {
  return (structuredEvidence?.bank?.signals ?? []).filter((s) => s.matched);
}

async function obligationIdDeLaUnidad(unitId: string): Promise<string | null> {
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { obligations: { where: { deletedAt: null }, select: { id: true }, take: 1 } } });
  return unit?.obligations[0]?.id ?? null;
}

/** Resuelve la organización desde el pago en servidor y exige membership antes de cualquier decisión. */
async function requireReviewAccess(paymentTransactionId: string) {
  const pago = await prisma.paymentTransaction.findUnique({
    where: { id: paymentTransactionId },
    select: { organizationId: true },
  });
  if (!pago?.organizationId) throw new Error("El pago no tiene una organización real resuelta.");
  return requireOrganizationAccess(pago.organizationId);
}

async function requireCandidateInOrganization(candidateUnitId: string, organizationId: string): Promise<void> {
  const unit = await prisma.unit.findUnique({ where: { id: candidateUnitId }, select: { organizationId: true } });
  if (!unit || unit.organizationId !== organizationId) throw new Error("La unidad candidata no pertenece a la organización del pago.");
}

export interface ResultadoDecision {
  ok: boolean;
  error?: string;
}

/** Corre después del commit: ningún fallo de actividad altera la decisión humana. */
async function registrarActividadDecision(administratorId: string, organizationId: string, paymentTransactionId: string, type: "CASE_APPROVED" | "CASE_REJECTED"): Promise<void> {
  try {
    await appendProductEventSafely({ administratorId, organizationId, type, metadata: { paymentTransactionId } });
    const decisionCount = await prisma.reconciliationMatch.count({ where: { decidedBy: administratorId, paymentTransaction: { organizationId } } });
    if (decisionCount === 1) await appendProductEventSafely({ administratorId, organizationId, type: "FIRST_CASE_RESOLVED", metadata: { paymentTransactionId } });
  } catch (error) {
    console.error("[product-observability] No se pudo registrar actividad de decisión:", error);
  }
}

/**
 * APROBAR — decision=APPROVED, fijo en el código (nunca AUTO, nunca
 * parametrizable). Provenance ORGANIC resultante SOLO si el entorno
 * conectado se confirma "production" (ver `reasonSegunEntorno` arriba) —
 * en dev-fixtures (o cualquier entorno ambiguo) queda automáticamente
 * marcada SYNTHETIC_DEMO, sin importar quién hizo clic.
 */
export async function aprobarDecisionHumanaAction(paymentTransactionId: string, candidateUnitId: string): Promise<ResultadoDecision> {
  try {
    const { administrator, organizationId } = await requireReviewAccess(paymentTransactionId);
    const evaluacion = await prisma.paymentEvidenceAssessmentLog.findFirst({
      where: { paymentTransactionId, candidateUnitId },
      orderBy: { createdAt: "desc" },
    });
    if (!evaluacion) return { ok: false, error: "No hay ninguna evaluación real del motor para este pago y esta unidad." };
    await requireCandidateInOrganization(candidateUnitId, organizationId);

    const families = evaluacion.families as unknown as EvidenceFamilyResult[];
    const familia = families.find((f) => f.unitId === candidateUnitId);
    const structuredEvidence = evaluacion.structuredEvidence as StructuredEvidenceSnapshot | null;
    const obligationId = await obligationIdDeLaUnidad(candidateUnitId);

    await prisma.$transaction((tx) =>
      registrarDecisionHumana(tx, {
        paymentTransactionId,
        unitId: candidateUnitId,
        obligationId,
        decision: "APPROVED",
        score: familia?.score ?? null,
        signals: signalsMatcheadasDelCandidato(structuredEvidence),
        reason: reasonSegunEntorno("Aprobado por un administrador en la bandeja de revisión humana (/conciliacion/revision-humana)."),
        decidedBy: administrator.id,
      })
    );

    await registrarActividadDecision(administrator.id, organizationId, paymentTransactionId, "CASE_APPROVED");

    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo registrar la aprobación." };
  }
}

/**
 * RECHAZAR — decision=REJECTED, fijo en el código. Requiere un motivo
 * escrito por el administrador (auditabilidad — nunca un default genérico
 * que oculte el criterio real). Este REJECTED queda inmediatamente visible
 * para el motor real vía el mismo `PREVIOUSLY_REJECTED`
 * (deterministic-matcher.ts, sin tocar) en cualquier evaluación futura de
 * este mismo pago+unidad.
 */
export async function rechazarDecisionHumanaAction(paymentTransactionId: string, candidateUnitId: string, motivo: string): Promise<ResultadoDecision> {
  const motivoLimpio = motivo.trim();
  if (!motivoLimpio) return { ok: false, error: "El rechazo requiere un motivo — no se puede registrar sin explicación." };

  try {
    const { administrator, organizationId } = await requireReviewAccess(paymentTransactionId);
    const evaluacion = await prisma.paymentEvidenceAssessmentLog.findFirst({
      where: { paymentTransactionId, candidateUnitId },
      orderBy: { createdAt: "desc" },
    });
    if (!evaluacion) return { ok: false, error: "No hay ninguna evaluación real del motor para este pago y esta unidad." };
    await requireCandidateInOrganization(candidateUnitId, organizationId);

    const families = evaluacion.families as unknown as EvidenceFamilyResult[];
    const familia = families.find((f) => f.unitId === candidateUnitId);
    const structuredEvidence = evaluacion.structuredEvidence as StructuredEvidenceSnapshot | null;
    const obligationId = await obligationIdDeLaUnidad(candidateUnitId);

    await prisma.$transaction((tx) =>
      registrarDecisionHumana(tx, {
        paymentTransactionId,
        unitId: candidateUnitId,
        obligationId,
        decision: "REJECTED",
        score: familia?.score ?? null,
        signals: signalsMatcheadasDelCandidato(structuredEvidence),
        reason: reasonSegunEntorno("Rechazado por un administrador en la bandeja de revisión humana (/conciliacion/revision-humana)."),
        decidedBy: administrator.id,
        rejectionReason: esEntornoDeProduccionConfirmado() ? motivoLimpio : `${MARCADOR_DECISION_SINTETICA_DEMO} ${motivoLimpio}`,
      })
    );

    await registrarActividadDecision(administrator.id, organizationId, paymentTransactionId, "CASE_REJECTED");

    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo registrar el rechazo." };
  }
}

// --- Fase 5.13 — casos ambiguos: elegir un candidato, o rechazarlos todos ---
//
// LIMITACIÓN REAL, documentada a propósito (nunca se fabrica evidencia para
// evitarla): para un caso AMBIGUOUS, `match-engine.ts` no calcula un
// `winner` — `signals: ganador?.signals ?? []` queda vacío en
// `ShadowMatchResult`, así que `structuredEvidence.bank.signals` NO tiene el
// detalle Signal[] completo (tier/strength/evidence) de NINGÚN candidato acá,
// solo `topCandidates[i].matchedSignals` (nombres de señal, sin ese detalle).
// Registrar `signals: []` en este camino es la opción honesta — inventar
// tier/strength/evidence por señal sería exactamente la "heurística
// engañosa para fabricar evidencia" que esta fase prohíbe explícitamente.
// El nombre de las señales reales que distinguían al candidato elegido/
// rechazado se preserva igual, en texto, dentro de `reason`.

async function resolverUnitIdsReales(organizationId: string, unitCodes: string[]): Promise<Map<string, string>> {
  const units = await prisma.unit.findMany({ where: { organizationId, code: { in: unitCodes } }, select: { id: true, code: true } });
  return new Map(units.map((u) => [u.code, u.id]));
}

/**
 * ELEGIR — de un caso ambiguo, el administrador identifica cuál de los
 * candidatos reales es correcto. `decision="APPROVED"` fijo en el código.
 * `unitCodeElegido` se resuelve contra `Unit` real de la MISMA organización
 * del pago (`@@unique([organizationId, code])` — nunca ambiguo entre
 * consorcios distintos).
 */
export async function elegirCandidatoAction(paymentTransactionId: string, unitCodeElegido: string): Promise<ResultadoDecision> {
  try {
    const { administrator, organizationId } = await requireReviewAccess(paymentTransactionId);
    const evaluacion = await prisma.paymentEvidenceAssessmentLog.findFirst({
      where: { paymentTransactionId, candidateUnitId: null },
      orderBy: { createdAt: "desc" },
    });
    if (!evaluacion) return { ok: false, error: "No hay ninguna evaluación ambigua real para este pago." };

    const structuredEvidence = evaluacion.structuredEvidence as StructuredEvidenceSnapshot | null;
    const candidato = structuredEvidence?.bank?.topCandidates?.find((c) => c.unitCode === unitCodeElegido);
    if (!candidato) return { ok: false, error: "El candidato elegido ya no está entre las opciones reales de esta evaluación." };

    const unitIdPorCode = await resolverUnitIdsReales(organizationId, [unitCodeElegido]);
    const unitId = unitIdPorCode.get(unitCodeElegido);
    if (!unitId) return { ok: false, error: `No existe ninguna Unit real con código "${unitCodeElegido}" en la organización de este pago.` };

    const obligationId = await obligationIdDeLaUnidad(unitId);
    const señalesTexto = candidato.matchedSignals.length > 0 ? ` Señales reales que lo distinguían: ${candidato.matchedSignals.join(", ")} (score=${candidato.score}, tier=${candidato.tier ?? "—"}).` : "";

    await prisma.$transaction((tx) =>
      registrarDecisionHumana(tx, {
        paymentTransactionId,
        unitId,
        obligationId,
        decision: "APPROVED",
        score: candidato.score,
        // Ver nota de LIMITACIÓN REAL arriba — nunca se fabrica un Signal[] detallado para este camino.
        signals: [],
        reason: reasonSegunEntorno(`Elegido entre ${structuredEvidence?.bank?.topCandidates?.length ?? "varios"} candidatos ambiguos por un administrador en /conciliacion/revision-humana.${señalesTexto}`),
        decidedBy: administrator.id,
      })
    );

    await registrarActividadDecision(administrator.id, organizationId, paymentTransactionId, "CASE_APPROVED");

    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo registrar la elección." };
  }
}

/**
 * RECHAZAR TODOS — ninguno de los candidatos reales es correcto. Escribe UN
 * `REJECTED` por cada candidato real (append-only, nunca un unitId nulo —
 * `registrarDecisionHumana()` no lo admite y no hace falta tocarla: cada
 * candidato es una unidad real, rechazarla individualmente es información
 * MÁS precisa que un "ninguno" genérico, y alimenta `PREVIOUSLY_REJECTED`
 * para cada una en cualquier evaluación futura de este mismo pago).
 */
export async function rechazarTodosLosCandidatosAction(paymentTransactionId: string, motivo: string): Promise<ResultadoDecision> {
  const motivoLimpio = motivo.trim();
  if (!motivoLimpio) return { ok: false, error: "El rechazo requiere un motivo — no se puede registrar sin explicación." };

  try {
    const { administrator, organizationId } = await requireReviewAccess(paymentTransactionId);
    const evaluacion = await prisma.paymentEvidenceAssessmentLog.findFirst({
      where: { paymentTransactionId, candidateUnitId: null },
      orderBy: { createdAt: "desc" },
    });
    if (!evaluacion) return { ok: false, error: "No hay ninguna evaluación ambigua real para este pago." };

    const structuredEvidence = evaluacion.structuredEvidence as StructuredEvidenceSnapshot | null;
    const candidatos = structuredEvidence?.bank?.topCandidates ?? [];
    if (candidatos.length === 0) return { ok: false, error: "Esta evaluación no tiene ningún candidato real registrado." };

    const unitIdPorCode = await resolverUnitIdsReales(organizationId, candidatos.map((c) => c.unitCode));

    const rejectionReasonFinal = esEntornoDeProduccionConfirmado() ? motivoLimpio : `${MARCADOR_DECISION_SINTETICA_DEMO} ${motivoLimpio}`;
    const reasonFinal = reasonSegunEntorno(`Rechazado (ninguno de los ${candidatos.length} candidatos ambiguos era correcto) por un administrador en /conciliacion/revision-humana.`);

    let registrados = 0;
    for (const candidato of candidatos) {
      const unitId = unitIdPorCode.get(candidato.unitCode);
      if (!unitId) continue; // dato real inconsistente entre topCandidates y Unit vigente — se omite, nunca se inventa
      const obligationId = await obligationIdDeLaUnidad(unitId);
      await prisma.$transaction((tx) =>
        registrarDecisionHumana(tx, {
          paymentTransactionId,
          unitId,
          obligationId,
          decision: "REJECTED",
          score: candidato.score,
          signals: [], // ver nota de LIMITACIÓN REAL arriba
          reason: reasonFinal,
          decidedBy: administrator.id,
          rejectionReason: rejectionReasonFinal,
        })
      );
      registrados++;
    }

    if (registrados === 0) return { ok: false, error: "Ningún candidato real pudo resolverse contra Unit vigente — no se registró nada." };

    await registrarActividadDecision(administrator.id, organizationId, paymentTransactionId, "CASE_REJECTED");
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo registrar el rechazo." };
  }
}
