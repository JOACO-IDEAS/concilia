import { Building2, Zap } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { formatARS } from "@/lib/format";
import type { TopOrganizacion } from "@/app/dashboard/metrics-actions";

export function TopOrganizacionesTable({ organizaciones }: { organizaciones: TopOrganizacion[] }) {
  return (
    <Card className="animate-fade-in-up">
      <CardHeader
        title="Top organizaciones"
        subtitle="Mayor volumen cobrado y % con organización identificada automáticamente"
      />
      {organizaciones.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Building2 size={20} />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Sin cobros con organización identificada todavía
          </p>
          <p className="max-w-[220px] text-xs text-slate-400">
            El ranking aparece apenas se identifique la organización del primer pago.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {organizaciones.map((org, i) => (
            <li key={org.id} className="flex items-center gap-3 px-5 py-3.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                  {org.name}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                  <Zap size={11} />
                  {org.porcentajeOrganizacionAutoResuelta}% automático · {org.cantidadPagos}{" "}
                  {org.cantidadPagos === 1 ? "pago" : "pagos"}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatARS(org.totalCobrado)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
