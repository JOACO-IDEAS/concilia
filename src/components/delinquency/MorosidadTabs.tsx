"use client";

import { useState } from "react";
import { LegacyMorosidadView } from "./LegacyMorosidadView";
import { OverdueOrganizationsPanel } from "./OverdueOrganizationsPanel";
import type { ListaMorosidadResultado } from "@/app/morosidad/actions";
import { Bot, ClipboardList } from "lucide-react";

type Tab = "clasica" | "ia";

export function MorosidadTabs({ datosMorosidad }: { datosMorosidad: ListaMorosidadResultado }) {
  const [tab, setTab] = useState<Tab>("ia");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900 sm:inline-flex">
        <button
          onClick={() => setTab("ia")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
            tab === "ia"
              ? "bg-blue-600 text-white"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <Bot size={14} />
          Cobranza Automática (IA)
          {datosMorosidad.ok && datosMorosidad.organizaciones.length > 0 ? (
            <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {datosMorosidad.organizaciones.length}
            </span>
          ) : null}
        </button>
        <button
          onClick={() => setTab("clasica")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
            tab === "clasica"
              ? "bg-blue-600 text-white"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <ClipboardList size={14} />
          Vista clásica (demo)
        </button>
      </div>

      {tab === "ia" ? <OverdueOrganizationsPanel datosIniciales={datosMorosidad} /> : null}
      {tab === "clasica" ? <LegacyMorosidadView /> : null}
    </div>
  );
}
