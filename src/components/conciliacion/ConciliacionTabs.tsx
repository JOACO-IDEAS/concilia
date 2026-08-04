"use client";

import { useState } from "react";
import { ReconciliationView } from "@/components/reconciliation/ReconciliationView";
import { WebhooksPanel } from "./WebhooksPanel";
import { StatementIngestionPanel } from "./StatementIngestionPanel";
import type { ListaPagosResultado } from "@/app/conciliacion/payments-actions";
import { Landmark, Webhook, FileText } from "lucide-react";

type Tab = "manual" | "webhooks" | "extractos";

export function ConciliacionTabs({ datosWebhooks }: { datosWebhooks: ListaPagosResultado }) {
  const [tab, setTab] = useState<Tab>("manual");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900 sm:inline-flex">
        <button
          onClick={() => setTab("manual")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
            tab === "manual"
              ? "bg-blue-600 text-white"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <Landmark size={14} />
          Conciliación manual
        </button>
        <button
          onClick={() => setTab("webhooks")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
            tab === "webhooks"
              ? "bg-blue-600 text-white"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <Webhook size={14} />
          Webhooks (Open Banking)
          {datosWebhooks.ok && datosWebhooks.pagos.some((p) => p.status !== "MATCHED") ? (
            <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {datosWebhooks.pagos.filter((p) => p.status !== "MATCHED").length}
            </span>
          ) : null}
        </button>
        <button
          onClick={() => setTab("extractos")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
            tab === "extractos"
              ? "bg-blue-600 text-white"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <FileText size={14} />
          Extractos PDF
        </button>
      </div>

      {tab === "manual" ? <ReconciliationView /> : null}
      {tab === "webhooks" ? <WebhooksPanel datosIniciales={datosWebhooks} /> : null}
      {tab === "extractos" ? (
        <StatementIngestionPanel onVerWebhooks={() => setTab("webhooks")} />
      ) : null}
    </div>
  );
}
