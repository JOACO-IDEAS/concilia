import { ClipboardCheck, Inbox, Landmark } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { OperationalEmptyState } from "./OperationalEmptyState";
import type { ActivityEntry, RecentActivityViewModel } from "./operational-inbox-view-model";

function ActivityIcon({ kind }: { kind: ActivityEntry["kind"] }) {
  return kind === "HUMAN_DECISION" ? <ClipboardCheck size={15} className="text-emerald-600" /> : <Landmark size={15} className="text-blue-600" />;
}

/** Actividad reciente vive dentro de Inicio — no es un módulo propio del
 * sidebar. "No disponible" y "sin actividad todavía" son estados distintos:
 * el primero es un problema de infraestructura, el segundo es honesto y
 * esperable para una organización nueva. Nunca se inventa actividad. */
export function RecentActivity({ activity }: { activity: RecentActivityViewModel }) {
  return (
    <Card>
      <CardHeader title="Actividad reciente" subtitle="Movimientos y decisiones registrados en tus consorcios." />
      {activity.status === "unavailable" ? (
        <OperationalEmptyState icon={<Inbox size={18} className="text-slate-400" />} message="La actividad reciente no está disponible en este entorno todavía." />
      ) : activity.entries.length === 0 ? (
        <OperationalEmptyState icon={<Inbox size={18} className="text-slate-400" />} message={activity.contradictionNote ?? "Todavía no hay actividad operativa para mostrar."} />
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {activity.entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 px-5 py-3.5">
              <ActivityIcon kind={entry.kind} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{entry.title}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{entry.organizationName} · {entry.detail}</p>
              </div>
              <span className="shrink-0 text-xs text-slate-400">{entry.whenLabel}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
