import type { FirstReviewableCaseStatus, OperationalInboxData } from "@/app/operational-inbox-data";

export type FirstValueMilestoneState = "COMPLETE" | "CURRENT" | "PENDING" | "BLOCKED";

export type FirstValueMilestone = {
  key: "ORGANIZATION" | "UNITS" | "OBLIGATIONS" | "PAYMENTS" | "ASSESSMENT" | "REVIEWABLE_CASE";
  title: string;
  detail: string;
  state: FirstValueMilestoneState;
  href?: string;
  action?: string;
};

export type FirstValueProgress = {
  complete: boolean;
  milestones: FirstValueMilestone[];
};

/**
 * Traduce hechos tenant-scoped a progreso operativo. El tramo final no infiere
 * estados: sólo presenta la semántica ya decidida por getFirstReviewableCaseStatus.
 */
export function getFirstValueProgress(
  data: OperationalInboxData,
  firstReviewableStatus: FirstReviewableCaseStatus,
  firstReviewableCaseHref?: string,
): FirstValueProgress {
  const { organizationCount, onboarding } = data;
  if (onboarding.firstDecisionCount > 0) return { complete: true, milestones: [] };

  const organizationReady = organizationCount > 0;
  const unitsReady = organizationReady && onboarding.unitCount > 0;
  const obligationsReady = unitsReady && onboarding.obligationCount > 0;
  const paymentsReady = obligationsReady && onboarding.paymentCount > 0;

  const milestones: FirstValueMilestone[] = [
    organizationReady
      ? { key: "ORGANIZATION", title: "Consorcio disponible", detail: "Listo para organizar el padrón y los movimientos.", state: "COMPLETE" }
      : { key: "ORGANIZATION", title: "Creá o importá un consorcio", detail: "Es el punto de partida para trabajar con datos de tu organización.", state: "CURRENT", href: "/importar", action: "Importar consorcio" },
    unitsReady
      ? { key: "UNITS", title: "Unidades disponibles", detail: "El padrón ya permite identificar posibles destinatarios de un pago.", state: "COMPLETE" }
      : organizationReady
        ? { key: "UNITS", title: "Cargá las unidades", detail: "El padrón permite identificar a qué unidad podría corresponder un pago.", state: "CURRENT", href: "/unidades-config", action: "Gestionar unidades" }
        : { key: "UNITS", title: "Unidades disponibles", detail: "Este paso se habilita cuando exista un consorcio.", state: "PENDING" },
    obligationsReady
      ? { key: "OBLIGATIONS", title: "Obligaciones disponibles", detail: "Ya hay contexto de período e importe para revisar pagos.", state: "COMPLETE" }
      : unitsReady
        ? { key: "OBLIGATIONS", title: "Cargá las obligaciones", detail: "Dan contexto de período e importe al momento de revisar.", state: "CURRENT", href: "/obligaciones", action: "Cargar obligaciones" }
        : { key: "OBLIGATIONS", title: "Obligaciones disponibles", detail: "Este paso se habilita cuando las unidades estén cargadas.", state: "PENDING" },
    paymentsReady
      ? { key: "PAYMENTS", title: "Movimientos importados", detail: "Los movimientos reales ya están disponibles para el proceso operativo.", state: "COMPLETE" }
      : obligationsReady
        ? { key: "PAYMENTS", title: "Importá movimientos reales", detail: "Subí un extracto para registrar movimientos de tus consorcios.", state: "CURRENT", href: "/conciliacion", action: "Cargar extracto" }
        : { key: "PAYMENTS", title: "Movimientos importados", detail: "Este paso se habilita cuando existan obligaciones.", state: "PENDING" },
  ];

  if (!paymentsReady) {
    milestones.push(
      { key: "ASSESSMENT", title: "Evaluación disponible", detail: "Se habilita después de importar movimientos reales.", state: "PENDING" },
      { key: "REVIEWABLE_CASE", title: "Primer caso disponible", detail: "Aparecerá cuando exista evidencia suficiente para una decisión humana.", state: "PENDING" },
    );
    return { complete: false, milestones };
  }

  if (firstReviewableStatus.kind === "WAITING_PROCESSING") {
    milestones.push(
      { key: "ASSESSMENT", title: "Esperando evaluación", detail: firstReviewableStatus.message, state: "CURRENT" },
      { key: "REVIEWABLE_CASE", title: "Primer caso disponible", detail: "Se habilitará cuando exista una evaluación revisable.", state: "PENDING" },
    );
  } else if (firstReviewableStatus.kind === "WAITING_EVIDENCE") {
    milestones.push(
      { key: "ASSESSMENT", title: "Evaluación disponible", detail: "Listo. ConcilIA ya registró una evaluación para los movimientos importados.", state: "COMPLETE" },
      { key: "REVIEWABLE_CASE", title: "Esperando evidencia suficiente", detail: firstReviewableStatus.message, state: "CURRENT" },
    );
  } else if (firstReviewableStatus.kind === "REVIEWABLE") {
    milestones.push(
      { key: "ASSESSMENT", title: "Evaluación disponible", detail: "Listo. La evidencia ya permite una revisión humana.", state: "COMPLETE" },
      { key: "REVIEWABLE_CASE", title: "Tu primer caso está listo", detail: firstReviewableStatus.message, state: "CURRENT", href: firstReviewableCaseHref, action: firstReviewableCaseHref ? "Revisar caso" : undefined },
    );
  } else if (firstReviewableStatus.kind === "ASSESSMENT_UNAVAILABLE") {
    milestones.push(
      { key: "ASSESSMENT", title: "Evaluación no disponible", detail: firstReviewableStatus.message, state: "BLOCKED" },
      { key: "REVIEWABLE_CASE", title: "Primer caso disponible", detail: "Se habilitará cuando las evaluaciones estén disponibles.", state: "PENDING" },
    );
  } else {
    milestones.push(
      { key: "ASSESSMENT", title: "Evaluación disponible", detail: "Se habilita después de importar movimientos reales.", state: "PENDING" },
      { key: "REVIEWABLE_CASE", title: "Primer caso disponible", detail: "Aparecerá cuando exista evidencia suficiente para una decisión humana.", state: "PENDING" },
    );
  }

  return { complete: false, milestones };
}
