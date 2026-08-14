import Link from "next/link";
import { AlertCircle, CheckCircle2, FileSearch, Gauge } from "lucide-react";
import type { ReactNode } from "react";
import type { SummaryMetric } from "./operational-inbox-view-model";

type MetricTone = "amber" | "blue" | "neutral" | "emerald";

const TONE_CLASSES: Record<MetricTone, string> = {
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
};

type MetricCardProps = {
  icon: ReactNode;
  label: string;
  metric: SummaryMetric;
  tone: MetricTone;
  href?: string;
};

export function metricValueLabel(metric: SummaryMetric): string {
  if (metric.status === "unavailable") return "No disponible";
  if (metric.capped) return `${metric.value}+`;
  return String(metric.value);
}

function MetricCard({ icon, label, metric, tone, href }: MetricCardProps) {
  const toneClasses = metric.status === "unavailable" ? TONE_CLASSES.neutral : TONE_CLASSES[tone];
  const content = (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClasses}`}>{icon}</div>
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
 * total exacto engañoso. Semántica de color (nunca el único indicador — cada
 * card también tiene ícono y label de texto): ámbar=requiere decisión,
 * azul=requiere información, neutral=en proceso, verde=resuelto. Se renderiza
 * al final del flujo (ver `OperationalInbox.tsx`) — es contexto agregado, no
 * la prioridad principal de la pantalla. */
export function OperationalSummary({ summary }: { summary: { needsDecision: SummaryMetric; needsInformation: SummaryMetric; processedToday: SummaryMetric; resolvedToday: SummaryMetric } }) {
  return (
    <section aria-label="Resumen operativo" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard icon={<AlertCircle size={18} />} label="Requiere decisión" metric={summary.needsDecision} tone="amber" href="/conciliacion" />
      <MetricCard icon={<FileSearch size={18} />} label="Requiere información" metric={summary.needsInformation} tone="blue" href="/conciliacion" />
      <MetricCard icon={<Gauge size={18} />} label="Procesados hoy" metric={summary.processedToday} tone="neutral" />
      <MetricCard icon={<CheckCircle2 size={18} />} label="Resueltos hoy" metric={summary.resolvedToday} tone="emerald" />
    </section>
  );
}
