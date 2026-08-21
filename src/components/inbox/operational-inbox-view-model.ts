import type {
  FirstReviewableCaseStatus,
  OperationalInboxData,
  OperationalReviewItem,
  RecentActivity as RecentActivityRecord,
} from "@/app/operational-inbox-data";
import { formatMonto, formatRelativeTime } from "@/lib/format";
import { getFirstValueProgress, type FirstValueMilestone, type FirstValueMilestoneState } from "@/lib/first-value/progress";

/**
 * Contrato presentacional de Inicio. Deliberadamente desacoplado de Prisma:
 * ningún componente visual importa tipos de `@/generated/prisma` ni de
 * `operational-inbox-data.ts` directamente — todos consumen este contrato.
 * `buildOperationalInboxViewModel` es la única función que traduce los datos
 * ya autorizados/server-side (sin ampliar ninguna query) a esta forma.
 */

/** `capped=true` significa que el número mostrado puede ser un piso, no el
 * total exacto — la consulta subyacente tiene un límite (`take`) y ese límite
 * se alcanzó. Nunca se muestra como una cifra definitiva en ese caso. */
export type SummaryMetric =
  | { status: "available"; value: number; capped: boolean }
  | { status: "unavailable"; reason: string };

export type AttentionCase = {
  id: string;
  title: string;
  organizationName: string;
  amountLabel: string;
  reason: string;
  actionLabel: string;
  href: string;
};

export type InformationCase = {
  id: string;
  organizationName: string;
  amountLabel: string;
  referenceLabel: string;
  reason: string;
  ageLabel: string;
  href: string;
};

export type ActivityEntry = {
  id: string;
  kind: RecentActivityRecord["kind"];
  title: string;
  organizationName: string;
  detail: string;
  whenLabel: string;
};

export type RecentActivityViewModel =
  | { status: "available"; entries: ActivityEntry[]; contradictionNote?: string }
  | { status: "unavailable" };

/** 3 pasos máximo — agregación honesta de los 6 hitos reales de
 * `getFirstValueProgress` (nunca datos inventados). Cada paso expone el
 * estado más "urgente" de sus hitos reales y, si aplica, el href/label real
 * del primer hito accionable dentro de ese paso. */
export type SetupStep = {
  key: "CONFIGURE" | "IMPORT" | "REVIEW";
  title: string;
  detail: string;
  state: FirstValueMilestoneState;
  href?: string;
  actionLabel?: string;
};

export type SetupJourneyViewModel = {
  greetingContext: { title: string; explanation: string };
  steps: SetupStep[];
  primaryCta: { title: string; href: string; actionLabel: string } | null;
};

export type NextStep = {
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
};

export type QuickAction = { label: string; href: string };

export type OperationalInboxViewModel = {
  summary: {
    needsDecision: SummaryMetric;
    needsInformation: SummaryMetric;
    processedToday: SummaryMetric;
    resolvedToday: SummaryMetric;
  };
  /** Frase única de estado operativo (TASK 5.0I.1) — agrega needsDecision +
   * needsInformation, las dos colas reales que ya se muestran debajo. `null`
   * cuando cualquiera de las dos no está disponible: sumar un total parcial
   * sería un número inventado, así que en ese caso no se muestra nada acá
   * (cada cola ya explica su propio estado de indisponibilidad). */
  statusLine: string | null;
  attentionQueue: { available: boolean; cases: AttentionCase[] };
  informationQueue: InformationCase[];
  recentActivity: RecentActivityViewModel;
  nextStep: NextStep | null;
  setupJourney: SetupJourneyViewModel | null;
  quickActions: QuickAction[];
  delinquency: { href: string };
};

const REVIEW_ITEMS_QUERY_CAP = 500; // ver loadReviewableItems() — take:500 sobre paymentEvidenceAssessmentLog
const NEEDS_INFORMATION_QUERY_CAP = 8; // ver getOperationalInboxData() — take:8 sobre paymentTransaction UNMATCHED
const RECENT_ACTIVITY_QUERY_CAP = 8; // ver getOperationalInboxData() — take:8 combinado de pagos + decisiones

function isToday(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function attentionCaseTitle(kind: OperationalReviewItem["kind"]): string {
  return kind === "AMBIGUOUS" ? "Pago con varios candidatos posibles" : "Pago con coincidencia probable";
}

function buildAttentionQueue(reviewItems: OperationalReviewItem[]): AttentionCase[] {
  return reviewItems.map((item) => ({
    id: `${item.kind}:${item.id}`,
    title: attentionCaseTitle(item.kind),
    organizationName: item.organizationName,
    amountLabel: formatMonto(item.amount, item.currency),
    reason: item.detail,
    actionLabel: "Revisar",
    href: `/conciliacion/resolver/${item.paymentTransactionId}`,
  }));
}

function buildInformationQueue(data: OperationalInboxData): InformationCase[] {
  return data.needsInformation.map((payment) => ({
    id: payment.id,
    organizationName: payment.organizationName,
    amountLabel: formatMonto(payment.amount, payment.currency),
    referenceLabel: payment.concept ?? "Sin referencia",
    reason: "Todavía no hay evidencia suficiente para vincular este pago con una unidad.",
    ageLabel: formatRelativeTime(payment.createdAt),
    href: `/conciliacion/resolver/${payment.id}`,
  }));
}

/** Invariante de consistencia (sección 7): `resolvedToday` viene de una
 * consulta independiente de `recentActivity` — en teoría podrían discreparse
 * (ej. la decisión de hoy quedó fuera de la ventana `take:8` compartida por
 * ser más vieja que otros 8 eventos). Cuando eso ocurre, nunca se muestra un
 * "sin actividad" liso que contradiga visualmente al resumen — se aclara la
 * causa real en vez de ocultarla u ocultar el número. */
export function hasContradictoryEmptyActivity(entries: ActivityEntry[], resolvedTodayCount: number): boolean {
  return entries.length === 0 && resolvedTodayCount > 0;
}

function buildRecentActivity(data: OperationalInboxData): RecentActivityViewModel {
  const entries: ActivityEntry[] = data.recentActivity.map((activity) => ({
    id: activity.id,
    kind: activity.kind,
    title: activity.title,
    organizationName: activity.organizationName,
    detail: activity.detail,
    whenLabel: formatRelativeTime(activity.createdAt),
  }));
  if (hasContradictoryEmptyActivity(entries, data.resolvedToday)) {
    return {
      status: "available",
      entries,
      contradictionNote: `Se ${data.resolvedToday === 1 ? "resolvió 1 caso" : `resolvieron ${data.resolvedToday} casos`} hoy, pero no aparece en esta muestra reciente.`,
    };
  }
  return { status: "available", entries };
}

/** "Procesados hoy" no existe como campo propio en los datos actuales — se
 * deriva honestamente de `recentActivity` (ya server-fetched, sin query
 * nueva), filtrando a movimientos de hoy. Si el `take:8` compartido se
 * alcanzó, el número se marca `capped` porque puede haber más actividad de
 * hoy fuera de la ventana visible — nunca se presenta como total exacto en
 * ese caso. */
function buildProcessedTodayMetric(data: OperationalInboxData): SummaryMetric {
  const todayCount = data.recentActivity.filter((activity) => activity.kind === "PAYMENT_RECEIVED" && isToday(activity.createdAt)).length;
  const capped = data.recentActivity.length >= RECENT_ACTIVITY_QUERY_CAP;
  return { status: "available", value: todayCount, capped };
}

function buildNeedsDecisionMetric(reviewQueueAvailable: boolean, reviewItems: OperationalReviewItem[]): SummaryMetric {
  if (!reviewQueueAvailable) return { status: "unavailable", reason: "La cola de revisión detallada no está disponible en este entorno todavía." };
  return { status: "available", value: reviewItems.length, capped: reviewItems.length >= REVIEW_ITEMS_QUERY_CAP };
}

function buildNeedsInformationMetric(data: OperationalInboxData): SummaryMetric {
  return { status: "available", value: data.needsInformation.length, capped: data.needsInformation.length >= NEEDS_INFORMATION_QUERY_CAP };
}

function buildResolvedTodayMetric(data: OperationalInboxData): SummaryMetric {
  return { status: "available", value: data.resolvedToday, capped: false };
}

/** "Cuánto necesita mi atención hoy" en una sola frase (TASK 5.0I.1) — nunca
 * un número fijo: se deriva de las mismas dos métricas reales que las colas
 * de abajo ya calcularon. Si alguna no está disponible, no se arma un total
 * parcial engañoso. */
function buildStatusLine(needsDecision: SummaryMetric, needsInformation: SummaryMetric): string | null {
  if (needsDecision.status !== "available" || needsInformation.status !== "available") return null;
  const total = needsDecision.value + needsInformation.value;
  const capped = needsDecision.capped || needsInformation.capped;
  if (total === 0) return "Todo al día. No hay situaciones que requieran tu atención.";
  const situaciones = total === 1 ? "situación" : "situaciones";
  const requiere = total === 1 ? "requiere" : "requieren";
  return `Hay ${total}${capped ? "+" : ""} ${situaciones} que ${requiere} tu atención.`;
}

/** Una sola recomendación, derivada exclusivamente de datos ya disponibles —
 * nunca una segunda consulta. Prioriza lo más antiguo primero en cada cola,
 * consistente con el orden ascendente ya aplicado por la capa de datos. */
function buildNextStep(reviewQueueAvailable: boolean, reviewItems: OperationalReviewItem[], data: OperationalInboxData): NextStep | null {
  if (reviewQueueAvailable && reviewItems.length > 0) {
    const oldest = reviewItems[0];
    return {
      title: "Revisá el caso pendiente más antiguo",
      detail: `${oldest.organizationName} · ${formatMonto(oldest.amount, oldest.currency)} está esperando tu decisión.`,
      href: `/conciliacion/resolver/${oldest.paymentTransactionId}`,
      actionLabel: "Revisar caso",
    };
  }
  if (data.needsInformation.length > 0) {
    const oldest = data.needsInformation[0];
    return {
      title: "Investigá el pago sin resolver más antiguo",
      detail: `${oldest.organizationName} · ${formatMonto(oldest.amount, oldest.currency)} todavía no tiene evidencia suficiente.`,
      href: `/conciliacion/resolver/${oldest.id}`,
      actionLabel: "Investigar",
    };
  }
  if (!reviewQueueAvailable) {
    return {
      title: "Revisá Conciliación directamente",
      detail: "La cola de revisión resumida no está disponible en este entorno — el detalle completo sigue accesible ahí.",
      href: "/conciliacion",
      actionLabel: "Ir a Conciliación",
    };
  }
  return null;
}

const STEP_ORDER: FirstValueMilestoneState[] = ["BLOCKED", "CURRENT", "PENDING", "COMPLETE"];
function mostUrgent(states: FirstValueMilestoneState[]): FirstValueMilestoneState {
  for (const candidate of STEP_ORDER) if (states.includes(candidate)) return candidate;
  return "PENDING";
}
function firstActionable(milestones: FirstValueMilestone[]): FirstValueMilestone | undefined {
  return milestones.find((milestone) => milestone.href && (milestone.state === "CURRENT" || milestone.state === "BLOCKED"));
}

/** Construye la copia de un paso agregado. Cuando hay un hito accionable
 * real dentro del grupo, el título/detalle/acción del paso se toman
 * literalmente de ESE MISMO hito — nunca de una etiqueta inventada aparte —
 * para que el CTA nunca pueda describir un destino distinto del que el
 * texto del paso anuncia (ver UX.3.2 §2). Sólo se usa una copia fija propia
 * cuando el grupo ya está COMPLETE (no hay acción posible) o todavía no es
 * alcanzable (PENDING sin ningún hito accionable). */
function stepCopyFor(group: FirstValueMilestone[], completeCopy: { title: string; detail: string }, pendingCopy: { title: string; detail: string }): Omit<SetupStep, "key"> {
  const state = mostUrgent(group.map((m) => m.state));
  if (state === "COMPLETE") return { ...completeCopy, state };
  const actionable = firstActionable(group);
  if (actionable) return { title: actionable.title, detail: actionable.detail, state, href: actionable.href, actionLabel: actionable.action };
  return { ...pendingCopy, state };
}

/** Agrega los 6 hitos reales de `getFirstValueProgress` a 3 pasos máximo,
 * sin inventar ningún dato: cada paso toma el estado más urgente del grupo,
 * y su título/detalle/CTA vienen del mismo hito accionable real (nunca
 * texto inventado aparte — ver `stepCopyFor`). Un consorcio creado pero sin
 * unidades/obligaciones cargadas NO cuenta como "configurado" — el paso 1
 * sólo llega a COMPLETE cuando los 3 hitos que agrupa lo están. */
function buildSetupJourney(data: OperationalInboxData, firstReviewableStatus: FirstReviewableCaseStatus, firstReviewableCaseHref: string | undefined): SetupJourneyViewModel | null {
  if (data.onboarding.firstDecisionCount > 0) return null;
  const progress = getFirstValueProgress(data, firstReviewableStatus, firstReviewableCaseHref);
  const byKey = (keys: FirstValueMilestone["key"][]) => progress.milestones.filter((m) => keys.includes(m.key));

  const configureGroup = byKey(["ORGANIZATION", "UNITS", "OBLIGATIONS"]);
  const importGroup = byKey(["PAYMENTS"]);
  const reviewGroup = byKey(["ASSESSMENT", "REVIEWABLE_CASE"]);

  const steps: SetupStep[] = [
    { key: "CONFIGURE", ...stepCopyFor(configureGroup, { title: "Consorcio configurado", detail: "Consorcio, unidades y obligaciones ya están listos." }, { title: "Configurá tu consorcio", detail: "Consorcio, unidades y obligaciones — la base para identificar pagos." }) },
    { key: "IMPORT", ...stepCopyFor(importGroup, { title: "Movimientos importados", detail: "Ya hay movimientos reales disponibles para analizar." }, { title: "Importá movimientos", detail: "Se habilita después de configurar tu consorcio." }) },
    { key: "REVIEW", ...stepCopyFor(reviewGroup, { title: "Primer caso revisado", detail: "Ya tomaste tu primera decisión." }, { title: "Revisá tu primer caso", detail: "Se habilita después de importar movimientos reales." }) },
  ];

  const activeStep = steps.find((step) => step.href && (step.state === "CURRENT" || step.state === "BLOCKED"));
  return {
    greetingContext: { title: "Prepará tu primer caso", explanation: "Tres pasos reales, derivados del estado actual de tus consorcios." },
    steps,
    primaryCta: activeStep?.href ? { title: activeStep.title, href: activeStep.href, actionLabel: activeStep.actionLabel ?? "Continuar" } : null,
  };
}

export function buildOperationalInboxViewModel(
  data: OperationalInboxData,
  reviewItems: OperationalReviewItem[],
  reviewQueueAvailable: boolean,
  firstReviewableStatus: FirstReviewableCaseStatus,
): OperationalInboxViewModel {
  const firstReviewableCaseHref = reviewItems[0] ? `/conciliacion/resolver/${reviewItems[0].paymentTransactionId}` : undefined;
  const needsDecision = buildNeedsDecisionMetric(reviewQueueAvailable, reviewItems);
  const needsInformation = buildNeedsInformationMetric(data);
  return {
    summary: {
      needsDecision,
      needsInformation,
      processedToday: buildProcessedTodayMetric(data),
      resolvedToday: buildResolvedTodayMetric(data),
    },
    statusLine: buildStatusLine(needsDecision, needsInformation),
    attentionQueue: { available: reviewQueueAvailable, cases: reviewQueueAvailable ? buildAttentionQueue(reviewItems) : [] },
    informationQueue: buildInformationQueue(data),
    recentActivity: buildRecentActivity(data),
    nextStep: buildNextStep(reviewQueueAvailable, reviewItems, data),
    setupJourney: buildSetupJourney(data, firstReviewableStatus, firstReviewableCaseHref),
    quickActions: [
      { label: "Cargar extracto", href: "/conciliacion" },
      { label: "Importar consorcio", href: "/importar" },
      { label: "Gestionar unidades", href: "/unidades-config" },
    ],
    delinquency: { href: "/morosidad" },
  };
}

export type { FirstReviewableCaseStatus };
