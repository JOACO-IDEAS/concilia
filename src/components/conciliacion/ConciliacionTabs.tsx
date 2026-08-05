"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatementIngestionPanel } from "./StatementIngestionPanel";
import { AtencionRequeridaCard } from "./AtencionRequeridaCard";
import { ReconciliationView } from "@/components/reconciliation/ReconciliationView";
import type { ListaPagosResultado } from "@/app/conciliacion/payments-actions";
import type { BandejaInconsistenciasResultado } from "@/app/conciliacion/payments-actions";
import { formatDateTime, formatMonto } from "@/lib/format";
import { CircleCheck, Wrench, ChevronDown, ChevronUp } from "lucide-react";

/**
 * Flujo único de "Pagos" — ya no hay tabs entre Webhooks/Extractos/Manual:
 * son pasos de una misma tarea (cargar → aprobar lo que falta → ver lo ya
 * resuelto), no alternativas que el usuario tenga que elegir. "Conciliación
 * manual" (mock, `ReconciliationView`) sigue existiendo para casos
 * especiales/debugging, pero oculta detrás de un toggle discreto — el
 * flujo principal es Smart Match + aprobación.
 */
export function ConciliacionTabs({
  datosWebhooks,
  bandeja,
}: {
  datosWebhooks: ListaPagosResultado;
  bandeja: BandejaInconsistenciasResultado;
}) {
  const [modoManual, setModoManual] = useState(false);

  const historial = datosWebhooks.ok
    ? datosWebhooks.pagos.filter((p) => p.status === "MATCHED").slice(0, 5)
    : [];

  return (
    <div className="space-y-6">
      <StatementIngestionPanel />

      <AtencionRequeridaCard
        datosIniciales={bandeja}
        organizaciones={datosWebhooks.ok ? datosWebhooks.organizaciones : []}
      />

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

      <div className="pt-2 text-center">
        <button
          onClick={() => setModoManual((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
        >
          <Wrench size={12} />
          Conciliación manual (modo avanzado)
          {modoManual ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {modoManual ? <ReconciliationView /> : null}
    </div>
  );
}
