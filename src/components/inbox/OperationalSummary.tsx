import Link from "next/link";
import { AlertCircle, CheckCircle2, FileSearch, Gauge } from "lucide-react";
import type { ReactNode } from "react";
import type { SummaryMetric } from "./operational-inbox-view-model";

type MetricCardProps = {
  icon: ReactNode;
  label: string;
  metric: SummaryMetric;
  href?: string;
};

export function metricValueLabel(metric: SummaryMetric): string {
  if (metric.status === "unavailable") return "No disponible";
  if (metric.capped) return `${metric.value}+`;
  return String(metric.value);
}

function MetricCard({ icon, label, metric, href }: MetricCardProps) {
  const content = (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{icon}</div>
      <div className="min-w-0">
        <p className={`text-xl font-bold ${metric.status === "unavailable" ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-50"}`}>{metricValueLabel(metric)}</p>
        <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
  if (!href || metric.status === "unavailable") return content;
  return <Link href={href} className="block transition hover:border-slate-300 dark:hover:border-slate-700">{content}</Link>;
}

/** Resumen operativo — 4 métricas, cada una con significado propio y ligada
 * a una superficie real. Ninguna es decorativa: "No disponible" reemplaza
 * cualquier valor que no provenga de un dato server-side real, y los valores
 * con límite de consulta (`capped`) se muestran como piso ("N+"), nunca como
 * total exacto engañoso. */
export function OperationalSummary({ summary }: { summary: { needsDecision: SummaryMetric; needsInformation: SummaryMetric; processedToday: SummaryMetric; resolvedToday: SummaryMetric } }) {
  return (
    <section aria-label="Resumen operativo" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard icon={<AlertCircle size={18} />} label="Requiere decisión" metric={summary.needsDecision} href="/conciliacion" />
      <MetricCard icon={<FileSearch size={18} />} label="Requiere información" metric={summary.needsInformation} href="/conciliacion" />
      <MetricCard icon={<Gauge size={18} />} label="Procesados hoy" metric={summary.processedToday} />
      <MetricCard icon={<CheckCircle2 size={18} />} label="Resueltos hoy" metric={summary.resolvedToday} />
    </section>
  );
}
