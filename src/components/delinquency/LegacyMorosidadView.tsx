"use client";

import { StatCard } from "@/components/dashboard/StatCard";
import { DelinquencyTable } from "@/components/delinquency/DelinquencyTable";
import { useAppStore } from "@/lib/store";
import { formatARS } from "@/lib/format";
import { AlertOctagon, Clock, MessageCircleMore, Wallet } from "lucide-react";

// Flujo original del MVP (mock, en memoria) — Unidades Funcionales, no
// Organization. Se mantiene intacto como pestaña separada; el módulo real
// contra Postgres vive en OverdueOrganizationsPanel.tsx.
export function LegacyMorosidadView() {
  const { state } = useAppStore();
  const morosas = state.unidades.filter((u) => u.estado === "vencido");
  const totalAdeudado = morosas.reduce((sum, u) => sum + u.saldoPendiente, 0);
  const promedioAtraso = Math.round(
    morosas.reduce((sum, u) => sum + u.diasAtraso, 0) / (morosas.length || 1)
  );
  const criticas = morosas.filter((u) => u.diasAtraso >= 30).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Unidades morosas"
          value={`${morosas.length}`}
          deltaLabel={`de ${state.unidades.length} unidades totales`}
          icon={AlertOctagon}
          tone="rose"
        />
        <StatCard label="Monto total adeudado" value={formatARS(totalAdeudado)} icon={Wallet} tone="amber" />
        <StatCard label="Atraso promedio" value={`${promedioAtraso} días`} icon={Clock} tone="blue" />
        <StatCard
          label="Casos críticos (+30 días)"
          value={`${criticas}`}
          icon={MessageCircleMore}
          tone="rose"
        />
      </div>

      <DelinquencyTable unidades={morosas} />
    </div>
  );
}
