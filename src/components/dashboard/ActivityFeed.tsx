import { Card, CardHeader } from "@/components/ui/Card";
import { formatRelativeTime } from "@/lib/format";
import type { ActividadReciente } from "@/lib/types";
import { CheckCircle2, MessageCircle, AlertTriangle, RefreshCcw, ListChecks } from "lucide-react";

const iconByTipo: Record<ActividadReciente["tipo"], { icon: typeof CheckCircle2; className: string }> = {
  pago: { icon: CheckCircle2, className: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
  recordatorio: { icon: MessageCircle, className: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
  alerta: { icon: AlertTriangle, className: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" },
  conciliacion: { icon: RefreshCcw, className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  regla: { icon: ListChecks, className: "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400" },
};

export function ActivityFeed({ items }: { items: ActividadReciente[] }) {
  return (
    <Card>
      <CardHeader title="Actividad reciente" subtitle="Últimos eventos del sistema" />
      <ul className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
        {items.map((item) => {
          const cfg = iconByTipo[item.tipo];
          const Icon = cfg.icon;
          return (
            <li key={item.id} className="flex items-start gap-3 py-3.5">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cfg.className}`}>
                <Icon size={15} />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  {item.descripcion}
                </p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  {formatRelativeTime(item.fecha)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
