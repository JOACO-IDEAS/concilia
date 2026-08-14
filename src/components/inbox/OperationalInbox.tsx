import type { FirstReviewableCaseStatus, OperationalInboxData, OperationalReviewItem } from "@/app/operational-inbox-data";
import { buildOperationalInboxViewModel } from "./operational-inbox-view-model";
import { OperationalHeader } from "./OperationalHeader";
import { OperationalSummary } from "./OperationalSummary";
import { RecommendedNextStep } from "./RecommendedNextStep";
import { AttentionQueue } from "./AttentionQueue";
import { InformationQueue } from "./InformationQueue";
import { RecentActivity } from "./RecentActivity";
import { DelinquencyCallout } from "./DelinquencyCallout";
import { OperationalQuickActions } from "./OperationalQuickActions";
import { FirstValueJourney } from "./FirstValueJourney";

/**
 * Inicio — Operational Inbox canónica del piloto (TASK CLAUDE UX.3).
 * Autorización, alcance de datos y queries: IDÉNTICOS a antes de esta tarea
 * (ver `src/app/page.tsx`, sin cambios). Este componente es puramente
 * presentacional: traduce los mismos 3 payloads server-side ya recibidos a
 * un view model tipado (`buildOperationalInboxViewModel`) y compone
 * secciones reutilizables — nada acá amplía ninguna consulta ni deriva
 * organización del lado del cliente.
 */
export function OperationalInbox({
  data,
  reviewItems,
  reviewQueueAvailable,
  firstReviewableStatus,
}: {
  data: OperationalInboxData;
  reviewItems: OperationalReviewItem[];
  reviewQueueAvailable: boolean;
  firstReviewableStatus: FirstReviewableCaseStatus;
}) {
  const viewModel = buildOperationalInboxViewModel(data, reviewItems, reviewQueueAvailable);
  const firstReviewableCaseHref = reviewItems[0] ? `/conciliacion/resolver/${reviewItems[0].paymentTransactionId}` : undefined;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-4 sm:p-6">
      <OperationalHeader />

      {viewModel.showSetupJourney ? (
        // Organización nueva sin decisiones todavía: el journey de
        // onboarding ya cubre "qué necesito hacer" con hitos reales — un
        // resumen de métricas en cero y colas vacías serían ruido, no
        // claridad (principio "Cero Ficción" / evitar densidad decorativa).
        <>
          <FirstValueJourney data={data} firstReviewableStatus={firstReviewableStatus} firstReviewableCaseHref={firstReviewableCaseHref} />
          <OperationalQuickActions actions={viewModel.quickActions} />
        </>
      ) : (
        <>
          <OperationalSummary summary={viewModel.summary} />
          <RecommendedNextStep nextStep={viewModel.nextStep} />
          <div className="grid gap-6 lg:grid-cols-2">
            <AttentionQueue available={viewModel.attentionQueue.available} cases={viewModel.attentionQueue.cases} />
            <InformationQueue cases={viewModel.informationQueue} />
          </div>
          <RecentActivity activity={viewModel.recentActivity} />
          <DelinquencyCallout href={viewModel.delinquency.href} />
          <OperationalQuickActions actions={viewModel.quickActions} />
        </>
      )}
    </main>
  );
}
