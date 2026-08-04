"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { formatARS } from "@/lib/format";
import { downloadCSV } from "@/lib/export";
import { Card, CardHeader } from "@/components/ui/Card";
import { Building2, Download, Printer } from "lucide-react";

function mesLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split("-").map(Number);
  const fecha = new Date(y, m - 1, 1);
  const label = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(fecha);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function ReportesPanel() {
  const { state } = useAppStore();
  const [seleccionadoId, setSeleccionadoId] = useState(state.consorcios[0]?.id ?? "");

  const consorcio = state.consorcios.find((c) => c.id === seleccionadoId) ?? state.consorcios[0];
  const unidadesDelConsorcio = useMemo(
    () => state.unidades.filter((u) => u.consorcioId === consorcio?.id),
    [state.unidades, consorcio?.id]
  );

  const totales = useMemo(() => {
    return unidadesDelConsorcio.reduce(
      (acc, u) => {
        const cobrado = Math.max(0, u.expensaMensual - (u.estado === "pagado" ? 0 : u.saldoPendiente));
        acc.emitido += u.expensaMensual;
        acc.cobrado += cobrado;
        acc.pendiente += u.saldoPendiente;
        return acc;
      },
      { emitido: 0, cobrado: 0, pendiente: 0 }
    );
  }, [unidadesDelConsorcio]);

  const flujoDeCaja = useMemo(() => {
    const porMes = new Map<string, { emitido: number; cobrado: number; ajustes: number }>();
    unidadesDelConsorcio.forEach((u) => {
      u.movimientos.forEach((m) => {
        const mes = m.fecha.slice(0, 7);
        const entry = porMes.get(mes) ?? { emitido: 0, cobrado: 0, ajustes: 0 };
        if (m.tipo === "expensa") entry.emitido += m.monto;
        else if (m.tipo === "pago") entry.cobrado += Math.abs(m.monto);
        else if (m.tipo === "nota_credito" || m.tipo === "nota_debito") entry.ajustes += m.monto;
        porMes.set(mes, entry);
      });
    });
    return Array.from(porMes.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([mes, valores]) => ({ mes, ...valores, neto: valores.cobrado - valores.emitido - valores.ajustes }));
  }, [unidadesDelConsorcio]);

  if (!consorcio) return null;

  function exportarLiquidacionCSV() {
    downloadCSV(
      `liquidacion-expensas-${consorcio!.nombre.replace(/\s+/g, "_").toLowerCase()}.csv`,
      ["Unidad", "Titular", "CUIT", "Coeficiente %", "Expensa emitida", "Cobrado", "Saldo pendiente"],
      unidadesDelConsorcio.map((u) => [
        u.unidad,
        u.titular,
        u.cuit,
        u.coeficiente.toFixed(2),
        u.expensaMensual,
        Math.max(0, u.expensaMensual - (u.estado === "pagado" ? 0 : u.saldoPendiente)),
        u.saldoPendiente,
      ])
    );
  }

  function exportarFlujoCSV() {
    downloadCSV(
      `flujo-de-caja-${consorcio!.nombre.replace(/\s+/g, "_").toLowerCase()}.csv`,
      ["Mes", "Expensas emitidas", "Cobros recibidos", "Ajustes (notas)", "Resultado neto"],
      flujoDeCaja.map((f) => [mesLabel(f.mes), f.emitido, f.cobrado, f.ajustes, f.neto])
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      <Card className="no-print animate-fade-in-up h-fit">
        <CardHeader title="Consorcios" subtitle="Elegí un edificio para generar su reporte" />
        <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {state.consorcios.map((c) => {
            const isActive = c.id === consorcio.id;
            return (
              <li key={c.id}>
                <button
                  onClick={() => setSeleccionadoId(c.id)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isActive
                      ? "bg-blue-50 dark:bg-blue-500/10"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    <Building2 size={15} />
                  </div>
                  <div className="min-w-0">
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
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="print-area space-y-6">
        <div className="hidden print:block">
          <h1 className="text-xl font-bold">ConciliIA — Reporte financiero</h1>
          <p className="text-sm text-slate-500">Generado el {new Date().toLocaleDateString("es-AR")}</p>
        </div>

        <Card className="print-area animate-fade-in-up">
          <CardHeader
            title={`Liquidación de expensas — ${consorcio.nombre}`}
            subtitle={`${unidadesDelConsorcio.length} unidades · Período agosto 2026`}
            action={
              <div className="no-print flex items-center gap-2">
                <button
                  onClick={exportarLiquidacionCSV}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Download size={13} />
                  Excel (CSV)
                </button>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  <Printer size={13} />
                  Descargar PDF
                </button>
              </div>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-2.5 font-medium">Unidad</th>
                  <th className="px-5 py-2.5 font-medium">Titular</th>
                  <th className="px-5 py-2.5 font-medium">Coef.</th>
                  <th className="px-5 py-2.5 font-medium">Expensa emitida</th>
                  <th className="px-5 py-2.5 font-medium">Cobrado</th>
                  <th className="px-5 py-2.5 font-medium">Saldo pendiente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {unidadesDelConsorcio.map((u) => {
                  const cobrado = Math.max(
                    0,
                    u.expensaMensual - (u.estado === "pagado" ? 0 : u.saldoPendiente)
                  );
                  return (
                    <tr key={u.id}>
                      <td className="px-5 py-2 font-medium text-slate-800 dark:text-slate-200">
                        {u.unidad}
                      </td>
                      <td className="px-5 py-2 text-slate-600 dark:text-slate-300">{u.titular}</td>
                      <td className="px-5 py-2 text-slate-500 dark:text-slate-400">
                        {u.coeficiente.toFixed(2)}%
                      </td>
                      <td className="px-5 py-2 text-slate-700 dark:text-slate-200">
                        {formatARS(u.expensaMensual)}
                      </td>
                      <td className="px-5 py-2 text-emerald-600 dark:text-emerald-400">
                        {formatARS(cobrado)}
                      </td>
                      <td className="px-5 py-2 text-rose-600 dark:text-rose-400">
                        {u.saldoPendiente > 0 ? formatARS(u.saldoPendiente) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 text-sm font-semibold dark:border-slate-700">
                  <td className="px-5 py-3" colSpan={3}>
                    Totales
                  </td>
                  <td className="px-5 py-3">{formatARS(totales.emitido)}</td>
                  <td className="px-5 py-3 text-emerald-600 dark:text-emerald-400">
                    {formatARS(totales.cobrado)}
                  </td>
                  <td className="px-5 py-3 text-rose-600 dark:text-rose-400">
                    {formatARS(totales.pendiente)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <Card className="print-area animate-fade-in-up">
          <CardHeader
            title="Flujo de caja — cobranzas mensuales"
            subtitle="Expensas emitidas vs. cobros efectivamente recibidos, últimos 7 meses"
            action={
              <button
                onClick={exportarFlujoCSV}
                className="no-print inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Download size={13} />
                Excel (CSV)
              </button>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-2.5 font-medium">Mes</th>
                  <th className="px-5 py-2.5 font-medium">Expensas emitidas</th>
                  <th className="px-5 py-2.5 font-medium">Cobros recibidos</th>
                  <th className="px-5 py-2.5 font-medium">Ajustes (notas)</th>
                  <th className="px-5 py-2.5 font-medium">Resultado neto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {flujoDeCaja.map((f) => (
                  <tr key={f.mes}>
                    <td className="px-5 py-2 font-medium text-slate-800 dark:text-slate-200">
                      {mesLabel(f.mes)}
                    </td>
                    <td className="px-5 py-2 text-slate-700 dark:text-slate-200">
                      {formatARS(f.emitido)}
                    </td>
                    <td className="px-5 py-2 text-emerald-600 dark:text-emerald-400">
                      {formatARS(f.cobrado)}
                    </td>
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400">
                      {formatARS(f.ajustes)}
                    </td>
                    <td
                      className={`px-5 py-2 font-medium ${
                        f.neto >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {formatARS(f.neto)}
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
