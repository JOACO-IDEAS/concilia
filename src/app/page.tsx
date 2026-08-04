"use client";

import { Topbar } from "@/components/layout/Topbar";
import { StatCard } from "@/components/dashboard/StatCard";
import { ConsorciosOverview } from "@/components/dashboard/ConsorciosOverview";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { ConciliacionDonut } from "@/components/dashboard/ConciliacionDonut";
import { useAppStore } from "@/lib/store";
import { formatARS } from "@/lib/format";
import { Wallet, TrendingUp, Users, AlertOctagon } from "lucide-react";

export default function DashboardPage() {
  const { state } = useAppStore();
  const { consorcios, unidades, actividad } = state;

  const totalRecaudado = consorcios.reduce((sum, c) => sum + c.recaudacionEfectiva, 0);
  const totalEsperado = consorcios.reduce((sum, c) => sum + c.recaudacionEsperada, 0);
  const porcentajeAutoPromedio = Math.round(
    consorcios.reduce((sum, c) => sum + c.porcentajeConciliadoAuto, 0) / consorcios.length
  );

  const unidadesMorosas = unidades.filter((u) => u.estado === "vencido");
  const morosidadTotal = unidadesMorosas.reduce((sum, u) => sum + u.saldoPendiente, 0);

  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle={`Resumen general — Estudio Fernández Administraciones · ${consorcios.length} consorcios · ${unidades.length} unidades`}
      />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Recaudado del mes"
            value={formatARS(totalRecaudado)}
            delta={6.2}
            deltaLabel="vs. julio"
            icon={Wallet}
            tone="blue"
          />
          <StatCard
            label="Listo para aprobar en 1 clic"
            value={`${porcentajeAutoPromedio}%`}
            delta={4}
            deltaLabel="vs. julio"
            icon={TrendingUp}
            tone="emerald"
          />
          <StatCard
            label="Edificios gestionados"
            value={`${consorcios.length}`}
            deltaLabel={`${unidades.length} unidades funcionales`}
            icon={Users}
            tone="amber"
          />
          <StatCard
            label="Morosidad activa"
            value={formatARS(morosidadTotal)}
            deltaLabel={`${unidadesMorosas.length} unidades vencidas`}
            icon={AlertOctagon}
            tone="rose"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ConsorciosOverview consorcios={consorcios} />
          </div>
          <ConciliacionDonut porcentajeAuto={porcentajeAutoPromedio} porcentajeRevision={12} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ActivityFeed items={actividad.slice(0, 8)} />
          </div>
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            <p className="font-medium text-slate-700 dark:text-slate-200">
              Meta de recaudación total
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {Math.round((totalRecaudado / totalEsperado) * 100)}%
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${Math.round((totalRecaudado / totalEsperado) * 100)}%` }}
              />
            </div>
            <p className="mt-2">
              {formatARS(totalRecaudado)} de {formatARS(totalEsperado)} esperados este mes.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
