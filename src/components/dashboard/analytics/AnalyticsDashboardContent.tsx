import { Wallet, Zap, CircleAlert, Building2, DatabaseZap } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card } from "@/components/ui/Card";
import { formatARS } from "@/lib/format";
import { obtenerMetricasDashboard } from "@/app/dashboard/metrics-actions";
import { TrendChart } from "./TrendChart";
import { TopOrganizacionesTable } from "./TopOrganizacionesTable";

export async function AnalyticsDashboardContent() {
  const resultado = await obtenerMetricasDashboard();

  if (!resultado.ok || !resultado.kpis || !resultado.tendencia || !resultado.topOrganizaciones) {
    return (
      <Card className="animate-fade-in-up">
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <DatabaseZap size={22} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Todavía no hay una base de datos conectada
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
              Este panel va a mostrar las métricas de cobranza en tiempo real apenas se conecte una
              Postgres real.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const { kpis, tendencia, topOrganizaciones } = resultado;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Recaudado / organización identificada (mes)"
          value={formatARS(kpis.totalOrganizacionIdentificadaMes)}
          deltaLabel="pagos con organización identificada este mes"
          icon={Wallet}
          tone="blue"
        />
        <StatCard
          label="Organización identificada automáticamente"
          value={
            kpis.tasaIdentificacionAutomaticaDeOrganizacion !== null
              ? `${kpis.tasaIdentificacionAutomaticaDeOrganizacion}%`
              : "—"
          }
          deltaLabel="matcheados por webhook vs. a mano — no implica UF ni obligación identificada"
          icon={Zap}
          tone="emerald"
        />
        <StatCard
          label="Pagos pendientes / sin vincular"
          value={`${kpis.pagosPendientesCount}`}
          deltaLabel={`${formatARS(kpis.pagosPendientesMonto)} requieren acción manual`}
          icon={CircleAlert}
          tone="amber"
        />
        <StatCard
          label="Organizaciones activas"
          value={`${kpis.organizacionesActivas}`}
          deltaLabel="consorcios gestionados"
          icon={Building2}
          tone="rose"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendChart datos={tendencia} />
        </div>
        <TopOrganizacionesTable organizaciones={topOrganizaciones} />
      </div>
    </div>
  );
}
