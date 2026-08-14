import Link from "next/link";
import { ArrowRight, CheckCircle2, FileUp, Inbox, Landmark, Building2, ClipboardCheck } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { formatMonto, formatRelativeTime } from "@/lib/format";
import type { FirstReviewableCaseStatus, OperationalInboxData, RecentActivity } from "@/app/operational-inbox-data";
import { FirstValueJourney } from "./FirstValueJourney";

type ReviewItem = {
  id: string;
  paymentTransactionId: string;
  kind: "SINGLE" | "AMBIGUOUS";
  organizationName: string;
  amount: number;
  currency: string;
  createdAt: string;
  detail: string;
};

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <Card><CardHeader title={title} subtitle={subtitle} />{children}</Card>;
}

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">{children}<ArrowRight size={13} /></Link>;
}

function ActivityIcon({ kind }: { kind: RecentActivity["kind"] }) {
  return kind === "HUMAN_DECISION" ? <ClipboardCheck size={15} className="text-emerald-600" /> : <Landmark size={15} className="text-blue-600" />;
}

export function OperationalInbox({ data, reviewItems, reviewQueueAvailable, firstReviewableStatus }: { data: OperationalInboxData; reviewItems: ReviewItem[]; reviewQueueAvailable: boolean; firstReviewableStatus: FirstReviewableCaseStatus }) {
  const hasWork = reviewItems.length > 0 || data.needsInformation.length > 0;
  const needsFirstValueJourney = data.onboarding.firstDecisionCount === 0;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-4 sm:p-6">
      <section className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Hoy</p>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">{hasWork ? "Esto necesita tu atención." : "No hay pendientes para resolver ahora."}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">Priorizamos decisiones y excepciones reales de tus consorcios.</p>
      </section>

      {needsFirstValueJourney ? <FirstValueJourney data={data} firstReviewableStatus={firstReviewableStatus} firstReviewableCaseHref={reviewItems[0] ? `/conciliacion/resolver/${reviewItems[0].paymentTransactionId}` : undefined} /> : null}

      <Section title="Requiere decisión" subtitle="ConcilIA ya encontró evidencia suficiente para que revises el caso.">
        {!reviewQueueAvailable ? (
          <div className="px-5 py-5 text-sm text-slate-600 dark:text-slate-300">La cola de revisión detallada no está disponible en este entorno todavía. <ActionLink href="/conciliacion">Ir a Conciliación</ActionLink></div>
        ) : reviewItems.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-5 text-sm text-slate-600 dark:text-slate-300"><CheckCircle2 size={18} className="text-emerald-600" />No hay decisiones pendientes.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">{reviewItems.map((item) => <div key={`${item.kind}:${item.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="text-sm font-semibold">{item.kind === "AMBIGUOUS" ? "Pago con varios candidatos posibles" : "Pago con coincidencia probable"}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.organizationName} · {formatMonto(item.amount, item.currency)} · {item.detail}</p></div><ActionLink href={`/conciliacion/resolver/${item.paymentTransactionId}`}>Revisar</ActionLink></div>)}</div>
        )}
      </Section>

      <Section title="Requiere información" subtitle="Movimientos que todavía no pueden resolverse con seguridad.">
        {data.needsInformation.length === 0 ? <div className="flex items-center gap-3 px-5 py-5 text-sm text-slate-600 dark:text-slate-300"><CheckCircle2 size={18} className="text-emerald-600" />No hay pagos asociados a tus consorcios esperando más información.</div> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{data.needsInformation.map((payment) => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="text-sm font-semibold">Pago sin resolver</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{payment.organizationName} · {formatMonto(payment.amount, payment.currency)} · {payment.concept ?? "Sin referencia"} · {formatRelativeTime(payment.createdAt)}</p></div><ActionLink href={`/conciliacion/resolver/${payment.id}`}>Investigar</ActionLink></div>)}</div>}
      </Section>

      <Section title="Actividad reciente" subtitle="Movimientos y decisiones registrados en tus consorcios.">
        {data.recentActivity.length === 0 ? <div className="flex items-center gap-3 px-5 py-5 text-sm text-slate-600 dark:text-slate-300"><Inbox size={18} className="text-slate-400" />Todavía no hay actividad operativa para mostrar.</div> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{data.recentActivity.map((activity) => <div key={activity.id} className="flex items-center gap-3 px-5 py-3.5"><ActivityIcon kind={activity.kind} /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{activity.title}</p><p className="truncate text-xs text-slate-500 dark:text-slate-400">{activity.organizationName} · {activity.detail}</p></div><span className="shrink-0 text-xs text-slate-400">{formatRelativeTime(activity.createdAt)}</span></div>)}</div>}
      </Section>

      {data.resolvedToday > 0 ? <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400"><CheckCircle2 size={17} />{data.resolvedToday} {data.resolvedToday === 1 ? "caso resuelto" : "casos resueltos"} hoy.</p> : null}

      <section className="flex flex-wrap gap-3 border-t border-slate-200 pt-5 dark:border-slate-800"><ActionLink href="/conciliacion"><FileUp size={14} />Cargar extracto</ActionLink><ActionLink href="/importar"><Building2 size={14} />Importar consorcio</ActionLink><ActionLink href="/unidades-config">Gestionar unidades</ActionLink></section>
    </main>
  );
}
