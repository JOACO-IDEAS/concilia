"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { formatARS, formatDate } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import type { MovimientoCuenta, TipoMovimiento } from "@/lib/types";
import {
  Search,
  Phone,
  Mail,
  IdCard,
  Landmark,
  Plus,
  Minus,
  Receipt,
  ArrowRight,
} from "lucide-react";

const tipoMovimientoConfig: Record<
  TipoMovimiento,
  { label: string; tone: "green" | "amber" | "red" | "slate" | "blue" }
> = {
  expensa: { label: "Expensa emitida", tone: "slate" },
  pago: { label: "Pago recibido", tone: "green" },
  interes: { label: "Interés por mora", tone: "amber" },
  nota_credito: { label: "Nota de crédito", tone: "blue" },
  nota_debito: { label: "Nota de débito", tone: "red" },
};

export function UnidadesPanel() {
  const searchParams = useSearchParams();
  const { state, registrarPagoManual, agregarNota } = useAppStore();
  const { showToast } = useToast();

  const [seleccionadoId, setSeleccionadoId] = useState(
    searchParams.get("unidad") ?? state.unidades[0]?.id ?? ""
  );
  const [busqueda, setBusqueda] = useState("");
  const [consorcioFiltro, setConsorcioFiltro] = useState("todos");

  const [montoPago, setMontoPago] = useState("");
  const [medioPago, setMedioPago] = useState("Transferencia bancaria");
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10));

  const [tipoNota, setTipoNota] = useState<"nota_credito" | "nota_debito">("nota_credito");
  const [montoNota, setMontoNota] = useState("");
  const [conceptoNota, setConceptoNota] = useState("");

  const consorcioById = useMemo(
    () => new Map(state.consorcios.map((c) => [c.id, c])),
    [state.consorcios]
  );

  const filtradas = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    return state.unidades.filter((u) => {
      if (consorcioFiltro !== "todos" && u.consorcioId !== consorcioFiltro) return false;
      if (!term) return true;
      const consorcio = consorcioById.get(u.consorcioId);
      return (
        u.titular.toLowerCase().includes(term) ||
        u.unidad.toLowerCase().includes(term) ||
        consorcio?.nombre.toLowerCase().includes(term)
      );
    });
  }, [state.unidades, busqueda, consorcioFiltro, consorcioById]);

  const unidad = state.unidades.find((u) => u.id === seleccionadoId) ?? filtradas[0];
  const consorcio = unidad ? consorcioById.get(unidad.consorcioId) : undefined;

  const movimientosOrdenados = useMemo(() => {
    if (!unidad) return [];
    return [...unidad.movimientos].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }, [unidad]);

  const transaccionesVinculadas = useMemo(() => {
    if (!unidad) return [];
    return state.transacciones.filter((t) => t.unidadSugeridaId === unidad.id);
  }, [state.transacciones, unidad]);

  function handleRegistrarPago(e: React.FormEvent) {
    e.preventDefault();
    if (!unidad) return;
    const monto = Number(montoPago);
    if (!monto || monto <= 0) return;
    registrarPagoManual(unidad.id, monto, medioPago, fechaPago);
    showToast("Pago manual registrado", `${formatARS(monto)} — ${unidad.titular} (${unidad.unidad})`);
    setMontoPago("");
  }

  function handleAgregarNota(e: React.FormEvent) {
    e.preventDefault();
    if (!unidad) return;
    const monto = Number(montoNota);
    if (!monto || monto <= 0 || !conceptoNota.trim()) return;
    agregarNota(unidad.id, tipoNota, monto, conceptoNota.trim());
    showToast(
      tipoNota === "nota_credito" ? "Nota de crédito registrada" : "Nota de débito registrada",
      `${formatARS(monto)} — ${unidad.titular} (${unidad.unidad})`
    );
    setMontoNota("");
    setConceptoNota("");
  }

  if (!unidad) {
    return (
      <Card className="animate-fade-in-up">
        <div className="px-6 py-16 text-center text-sm text-slate-400">
          No hay unidades funcionales cargadas.
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
      <Card className="animate-fade-in-up flex h-fit max-h-[80vh] flex-col">
        <CardHeader title="Unidades funcionales" subtitle={`${filtradas.length} resultados`} />
        <div className="space-y-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 dark:border-slate-700">
            <Search size={14} className="text-slate-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por titular, unidad o consorcio…"
              className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
            />
          </div>
          <select
            value={consorcioFiltro}
            onChange={(e) => setConsorcioFiltro(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="todos">Todos los consorcios</option>
            {state.consorcios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {filtradas.map((u) => {
            const isActive = u.id === unidad.id;
            return (
              <li key={u.id}>
                <button
                  onClick={() => setSeleccionadoId(u.id)}
                  className={`flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-4 py-2.5 text-left transition-colors dark:border-slate-800 ${
                    isActive
                      ? "bg-blue-50 dark:bg-blue-500/10"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <span
                    className={`text-sm font-medium ${
                      isActive ? "text-blue-800 dark:text-blue-300" : "text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    {u.unidad} · {u.titular}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {consorcioById.get(u.consorcioId)?.nombre}
                  </span>
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
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {unidad.unidad} — {consorcio?.nombre}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {unidad.titular} · {unidad.tipoOcupante === "propietario" ? "Propietario" : "Inquilino"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <IdCard size={12} /> CUIT {unidad.cuit}
                </span>
                <span className="flex items-center gap-1">
                  <Phone size={12} /> {unidad.telefono}
                </span>
                <span className="flex items-center gap-1">
                  <Mail size={12} /> {unidad.email}
                </span>
                <span className="flex items-center gap-1">
                  <Landmark size={12} /> Coeficiente {unidad.coeficiente.toFixed(2)}%
                </span>
              </div>
            </div>
            <Badge tone={unidad.estado === "pagado" ? "green" : unidad.estado === "pendiente" ? "amber" : "red"}>
              {unidad.estado === "pagado" ? "Al día" : unidad.estado === "pendiente" ? "Pendiente" : "Vencido"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-4">
            {[
              { label: "Expensa mensual", value: formatARS(unidad.expensaMensual) },
              { label: "Saldo pendiente", value: formatARS(unidad.saldoPendiente) },
              { label: "Días de atraso", value: `${unidad.diasAtraso}` },
              { label: "Último pago", value: unidad.ultimoPago ? formatDate(unidad.ultimoPago) : "—" },
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
        </Card>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card className="animate-fade-in-up">
            <CardHeader title="Registrar pago manual" subtitle="Fuera de la conciliación bancaria" />
            <form onSubmit={handleRegistrarPago} className="space-y-3 px-5 py-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Monto
                </label>
                <input
                  type="number"
                  min={1}
                  value={montoPago}
                  onChange={(e) => setMontoPago(e.target.value)}
                  placeholder="150000"
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Medio de pago
                  </label>
                  <select
                    value={medioPago}
                    onChange={(e) => setMedioPago(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option>Transferencia bancaria</option>
                    <option>Efectivo</option>
                    <option>Mercado Pago</option>
                    <option>Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={fechaPago}
                    onChange={(e) => setFechaPago(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Receipt size={14} />
                Registrar pago
              </button>
            </form>
          </Card>

          <Card className="animate-fade-in-up">
            <CardHeader title="Nota de crédito / débito" subtitle="Ajustes manuales a la cuenta corriente" />
            <form onSubmit={handleAgregarNota} className="space-y-3 px-5 py-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTipoNota("nota_credito")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    tipoNota === "nota_credito"
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                      : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                  }`}
                >
                  <Minus size={13} /> Crédito
                </button>
                <button
                  type="button"
                  onClick={() => setTipoNota("nota_debito")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    tipoNota === "nota_debito"
                      ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"
                      : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                  }`}
                >
                  <Plus size={13} /> Débito
                </button>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Monto
                </label>
                <input
                  type="number"
                  min={1}
                  value={montoNota}
                  onChange={(e) => setMontoNota(e.target.value)}
                  placeholder="15000"
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Concepto
                </label>
                <input
                  value={conceptoNota}
                  onChange={(e) => setConceptoNota(e.target.value)}
                  placeholder="Ej: descuento por reparación a cargo del propietario"
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                Registrar nota
              </button>
            </form>
          </Card>
        </div>

        <Card className="animate-fade-in-up">
          <CardHeader
            title="Historial de cuenta corriente"
            subtitle="Expensas emitidas, pagos, intereses y notas"
          />
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white dark:bg-slate-900">
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-2.5 font-medium">Fecha</th>
                  <th className="hidden px-5 py-2.5 font-medium sm:table-cell">Tipo</th>
                  <th className="px-5 py-2.5 font-medium">Concepto</th>
                  <th className="px-5 py-2.5 font-medium text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {movimientosOrdenados.map((m: MovimientoCuenta) => {
                  const cfg = tipoMovimientoConfig[m.tipo];
                  const esPositivoParaDeuda = m.monto > 0;
                  return (
                    <tr key={m.id}>
                      <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">
                        {formatDate(m.fecha)}
                      </td>
                      <td className="hidden px-5 py-2.5 sm:table-cell">
                        <Badge tone={cfg.tone}>{cfg.label}</Badge>
                      </td>
                      <td className="px-5 py-2.5 text-slate-600 dark:text-slate-300">
                        <span className="mb-0.5 block sm:hidden">
                          <Badge tone={cfg.tone}>{cfg.label}</Badge>
                        </span>
                        {m.concepto}
                      </td>
                      <td
                        className={`px-5 py-2.5 text-right font-medium ${
                          esPositivoParaDeuda
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {esPositivoParaDeuda ? "+" : "−"}
                        {formatARS(Math.abs(m.monto))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="animate-fade-in-up">
          <CardHeader
            title="Extractos bancarios vinculados"
            subtitle="Transacciones de conciliación asociadas a esta unidad"
          />
          {transaccionesVinculadas.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-400">
              Todavía no hay transacciones bancarias vinculadas a esta unidad.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {transaccionesVinculadas.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-col gap-2 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-slate-700 dark:text-slate-200">{t.descripcionCruda}</p>
                    <p className="text-xs text-slate-400">
                      {t.banco} · {formatDate(t.fecha)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {formatARS(t.monto)}
                    </span>
                    <Badge tone={t.aprobado ? "green" : "slate"}>
                      {t.aprobado ? "Conciliado" : "Pendiente"}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-200 px-5 py-3 dark:border-slate-800">
            <a
              href="/conciliacion"
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Ir al módulo de conciliación
              <ArrowRight size={12} />
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
