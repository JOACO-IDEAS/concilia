"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { formatARS } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Building2, CircleCheck, TriangleAlert, CircleX, ArrowRight } from "lucide-react";
import type { EstadoConsorcio } from "@/lib/types";

const estadoConfig: Record<
  EstadoConsorcio,
  { label: string; tone: "green" | "amber" | "red"; icon: typeof CircleCheck; iconClassName: string }
> = {
  "al-dia": {
    label: "Al día",
    tone: "green",
    icon: CircleCheck,
    iconClassName: "text-emerald-500",
  },
  "con-demoras": {
    label: "Con demoras",
    tone: "amber",
    icon: TriangleAlert,
    iconClassName: "text-amber-500",
  },
  critico: { label: "Crítico", tone: "red", icon: CircleX, iconClassName: "text-rose-500" },
};

export function ConsorciosPanel() {
  const searchParams = useSearchParams();
  const { state } = useAppStore();
  const [seleccionadoId, setSeleccionadoId] = useState(
    searchParams.get("consorcio") ?? state.consorcios[0]?.id ?? ""
  );

  const consorcio = state.consorcios.find((c) => c.id === seleccionadoId) ?? state.consorcios[0];
  const unidadesDelConsorcio = useMemo(
    () => state.unidades.filter((u) => u.consorcioId === consorcio?.id),
    [state.unidades, consorcio?.id]
  );

  const conteoPorEstado = useMemo(() => {
    return {
      pagado: unidadesDelConsorcio.filter((u) => u.estado === "pagado").length,
      pendiente: unidadesDelConsorcio.filter((u) => u.estado === "pendiente").length,
      vencido: unidadesDelConsorcio.filter((u) => u.estado === "vencido").length,
    };
  }, [unidadesDelConsorcio]);

  if (!consorcio) return null;

  const cfg = estadoConfig[consorcio.estado];
  const CfgIcon = cfg.icon;
  const pctRecaudado = Math.round(
    (consorcio.recaudacionEfectiva / consorcio.recaudacionEsperada) * 100
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="animate-fade-in-up h-fit">
        <CardHeader title="Consorcios" subtitle={`${state.consorcios.length} edificios gestionados`} />
        <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {state.consorcios.map((c) => {
            const config = estadoConfig[c.estado];
            const isActive = c.id === consorcio.id;
            return (
              <li key={c.id}>
                <button
                  onClick={() => setSeleccionadoId(c.id)}
                  className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors ${
                    isActive
                      ? "bg-blue-50 dark:bg-blue-500/10"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    <Building2 size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm font-medium ${
                        isActive
                          ? "text-blue-800 dark:text-blue-300"
                          : "text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {c.nombre}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{c.barrio}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <config.icon size={11} className={config.iconClassName} />
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {config.label} · {c.unidades} UF
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="space-y-6">
        <Card className="animate-fade-in-up">
          <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {consorcio.nombre}
                </h2>
                <Badge tone={cfg.tone} icon={<CfgIcon size={12} />}>
                  {cfg.label}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {consorcio.direccion} · {consorcio.barrio}
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Administra: {consorcio.administrador} · CUIT {consorcio.cuit}
              </p>
            </div>
            <Link
              href="/unidades"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Ver todas las unidades
              <ArrowRight size={13} />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-4">
            {[
              { label: "Unidades", value: `${consorcio.unidades}` },
              { label: "Recaudación esperada", value: formatARS(consorcio.recaudacionEsperada) },
              { label: "Recaudación efectiva", value: formatARS(consorcio.recaudacionEfectiva) },
              { label: "% Listo p/ aprobar", value: `${consorcio.porcentajeConciliadoAuto}%` },
            ].map((stat) => (
              <div key={stat.label} className="bg-white px-4 py-4 dark:bg-slate-900">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {stat.label}
                </p>
                <p className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 px-5 py-5 dark:border-slate-800">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-300">
                Recaudación del mes
              </span>
              <span className="text-slate-400">{pctRecaudado}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${Math.min(100, pctRecaudado)}%` }}
              />
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-emerald-50 py-3 dark:bg-emerald-500/10">
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                  {conteoPorEstado.pagado}
                </p>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400/80">Al día</p>
              </div>
              <div className="rounded-lg bg-amber-50 py-3 dark:bg-amber-500/10">
                <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                  {conteoPorEstado.pendiente}
                </p>
                <p className="text-[11px] text-amber-600 dark:text-amber-400/80">Pendientes</p>
              </div>
              <div className="rounded-lg bg-rose-50 py-3 dark:bg-rose-500/10">
                <p className="text-lg font-bold text-rose-700 dark:text-rose-400">
                  {conteoPorEstado.vencido}
                </p>
                <p className="text-[11px] text-rose-600 dark:text-rose-400/80">Vencidas</p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="animate-fade-in-up">
          <CardHeader
            title="Unidades funcionales"
            subtitle={`${unidadesDelConsorcio.length} unidades en ${consorcio.nombre}`}
          />
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white dark:bg-slate-900">
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-2.5 font-medium">Unidad</th>
                  <th className="px-5 py-2.5 font-medium">Titular</th>
                  <th className="hidden px-5 py-2.5 font-medium sm:table-cell">Coeficiente</th>
                  <th className="px-5 py-2.5 font-medium">Saldo</th>
                  <th className="px-5 py-2.5 font-medium text-right">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {unidadesDelConsorcio.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                      {u.unidad}
                    </td>
                    <td className="px-5 py-2.5 text-slate-600 dark:text-slate-300">{u.titular}</td>
                    <td className="hidden px-5 py-2.5 text-slate-500 dark:text-slate-400 sm:table-cell">
                      {u.coeficiente.toFixed(2)}%
                    </td>
                    <td className="px-5 py-2.5">
                      {u.saldoPendiente > 0 ? (
                        <span className="font-medium text-rose-600 dark:text-rose-400">
                          {formatARS(u.saldoPendiente)}
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">Al día</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Link
                        href={`/unidades?unidad=${u.id}`}
                        className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Ver ficha
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
