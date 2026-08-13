import { CheckCircle2, History } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { formatRelativeTime } from "@/lib/format";
import type { OperationalActivityEntry } from "@/lib/product-observability/activity-feed";

export function OperationalActivityCenter({ entries }: { entries: OperationalActivityEntry[] }) {
  return <Card>
    <CardHeader title="Actividad" subtitle="Tu historial operativo reciente." />
    {entries.length === 0 ? (
      <div className="flex items-start gap-3 px-5 py-6 text-sm text-slate-600 dark:text-slate-300"><History size={19} className="mt-0.5 shrink-0 text-slate-400" /><p>A medida que trabajes en ConcilIA, tu actividad aparecerá aquí.</p></div>
    ) : (
      <ol className="divide-y divide-slate-100 dark:divide-slate-800">{entries.map((entry) => <li key={entry.id} className="flex items-center gap-3 px-5 py-4"><CheckCircle2 size={17} className="shrink-0 text-emerald-600" /><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800 dark:text-slate-100">{entry.message}</p></div><time dateTime={entry.occurredAt} className="shrink-0 text-xs text-slate-400">{formatRelativeTime(entry.occurredAt)}</time></li>)}</ol>
    )}
  </Card>;
}
