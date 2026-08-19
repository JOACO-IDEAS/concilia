import { Card, CardHeader } from "@/components/ui/Card";
import { StatementIngestionPanel } from "./StatementIngestionPanel";
import { AtencionRequeridaCard } from "./AtencionRequeridaCard";
import type { ListaPagosResultado } from "@/app/conciliacion/payments-actions";
import type { BandejaInconsistenciasResultado } from "@/app/conciliacion/payments-actions";
import { formatDateTime, formatMonto } from "@/lib/format";
import { CircleCheck } from "lucide-react";

/**
 * Flujo único de "Pagos" — ya no hay tabs entre Webhooks/Extractos/Manual:
 * son pasos de una misma tarea (aprobar lo que falta → cargar más → ver lo
 * ya resuelto), no alternativas que el usuario tenga que elegir.
 *
 * TASK UX 5.0 — orden por excepción: lo que requiere una decisión ahora va
 * primero (es la razón por la que alguien entra a esta pantalla la mayoría
 * de los días); cargar un extracto nuevo es una acción disponible siempre,
 * pero no compite por el primer lugar con un caso pendiente real. El
 * historial de lo ya resuelto queda al final — confirma que el trabajo
 * anterior se completó, no es lo que hay que decidir hoy.
 */
export function ConciliacionTabs({
  datosWebhooks,
  bandeja,
}: {
  datosWebhooks: ListaPagosResultado;
  bandeja: BandejaInconsistenciasResultado;
}) {
  const historial = datosWebhooks.ok
    ? datosWebhooks.pagos.filter((p) => p.status === "MATCHED").slice(0, 5)
    : [];

  return (
    <div className="space-y-6">
      <AtencionRequeridaCard
        datosIniciales={bandeja}
        organizaciones={datosWebhooks.ok ? datosWebhooks.organizaciones : []}
      />

      <StatementIngestionPanel />

      {historial.length > 0 ? (
        <Card className="animate-fade-in-up">
          <CardHeader title="Historial reciente" subtitle="Últimos pagos ya conciliados" />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {historial.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <CircleCheck size={15} className="shrink-0 text-emerald-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                      {p.organization?.name ?? "Sin organización"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {p.matchedAt ? formatDateTime(p.matchedAt) : formatDateTime(p.createdAt)}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">
                  {formatMonto(p.amount, p.currency)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
