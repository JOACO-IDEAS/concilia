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
import { SetupJourney } from "./SetupJourney";

/**
 * Inicio — Operational Inbox canónica del piloto (TASK CLAUDE UX.3 / UX.3.1).
 * Autorización, alcance de datos y queries: IDÉNTICOS a antes de esta tarea
 * (ver `src/app/page.tsx`, sin cambios). Este componente es puramente
 * presentacional: traduce los mismos 3 payloads server-side ya recibidos a
 * un view model tipado (`buildOperationalInboxViewModel`) y compone
 * secciones reutilizables — nada acá amplía ninguna consulta ni deriva
 * organización del lado del cliente.
 *
 * Orden de prioridad (UX.3.1, sección 6): decisiones que requieren atención
 * → siguiente acción recomendada → información faltante → actividad
 * reciente → resumen operativo. El resumen ya no es lo primero que se ve —
 * es contexto agregado, no la jerarquía principal de la pantalla.
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
  const viewModel = buildOperationalInboxViewModel(data, reviewItems, reviewQueueAvailable, firstReviewableStatus);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-4 sm:p-6">
      <OperationalHeader />

      {viewModel.setupJourney ? (
        // Organización sin ninguna decisión todavía: una única superficie de
        // preparación con 3 pasos máximo y una sola CTA — nada de resumen en
        // cero ni colas vacías compitiendo por atención (Cero Ficción /
        // claridad antes que densidad).
        <SetupJourney journey={viewModel.setupJourney} />
      ) : (
        <>
          <AttentionQueue available={viewModel.attentionQueue.available} cases={viewModel.attentionQueue.cases} />
          <RecommendedNextStep nextStep={viewModel.nextStep} />
          <InformationQueue cases={viewModel.informationQueue} />
          <RecentActivity activity={viewModel.recentActivity} />
          <OperationalSummary summary={viewModel.summary} />
          <DelinquencyCallout href={viewModel.delinquency.href} />
          <OperationalQuickActions actions={viewModel.quickActions} />
        </>
      )}
    </main>
  );
}
