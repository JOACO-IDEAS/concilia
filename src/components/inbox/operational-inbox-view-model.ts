import type {
  FirstReviewableCaseStatus,
  OperationalInboxData,
  OperationalReviewItem,
  RecentActivity as RecentActivityRecord,
} from "@/app/operational-inbox-data";
import { formatMonto, formatRelativeTime } from "@/lib/format";

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
  | { status: "available"; entries: ActivityEntry[] }
  | { status: "unavailable" };

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
  attentionQueue: { available: boolean; cases: AttentionCase[] };
  informationQueue: InformationCase[];
  recentActivity: RecentActivityViewModel;
  nextStep: NextStep | null;
  showSetupJourney: boolean;
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
    reason: "ConcilIA todavía no encontró evidencia suficiente para vincular este pago con una unidad.",
    ageLabel: formatRelativeTime(payment.createdAt),
    href: `/conciliacion/resolver/${payment.id}`,
  }));
}

function buildRecentActivity(data: OperationalInboxData): RecentActivityViewModel {
  if (data.recentActivity.length === 0) return { status: "available", entries: [] };
  return {
    status: "available",
    entries: data.recentActivity.map((activity) => ({
      id: activity.id,
      kind: activity.kind,
      title: activity.title,
      organizationName: activity.organizationName,
      detail: activity.detail,
      whenLabel: formatRelativeTime(activity.createdAt),
    })),
  };
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

export function buildOperationalInboxViewModel(
  data: OperationalInboxData,
  reviewItems: OperationalReviewItem[],
  reviewQueueAvailable: boolean,
): OperationalInboxViewModel {
  return {
    summary: {
      needsDecision: buildNeedsDecisionMetric(reviewQueueAvailable, reviewItems),
      needsInformation: buildNeedsInformationMetric(data),
      processedToday: buildProcessedTodayMetric(data),
      resolvedToday: buildResolvedTodayMetric(data),
    },
    attentionQueue: { available: reviewQueueAvailable, cases: reviewQueueAvailable ? buildAttentionQueue(reviewItems) : [] },
    informationQueue: buildInformationQueue(data),
    recentActivity: buildRecentActivity(data),
    nextStep: buildNextStep(reviewQueueAvailable, reviewItems, data),
    showSetupJourney: data.onboarding.firstDecisionCount === 0,
    quickActions: [
      { label: "Cargar extracto", href: "/conciliacion" },
      { label: "Importar consorcio", href: "/importar" },
      { label: "Gestionar unidades", href: "/unidades-config" },
    ],
    delinquency: { href: "/morosidad" },
  };
}

export type { FirstReviewableCaseStatus };
