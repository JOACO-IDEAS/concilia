"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatARS, formatDate } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import type { TransaccionBancaria } from "@/lib/types";
import {
  Check,
  CircleAlert,
  CircleHelp,
  Ban,
  ShieldAlert,
  ListPlus,
  ListChecks,
  Link2,
} from "lucide-react";
import { CrearReglaModal } from "./CrearReglaModal";

type Filtro = "todas" | "auto" | "revision" | "sin-match" | "duplicado" | "descartada";

const filtros: { id: Filtro; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "auto", label: "Listas para aprobar" },
  { id: "revision", label: "A revisar" },
  { id: "sin-match", label: "Sin match" },
  { id: "duplicado", label: "Duplicados" },
  { id: "descartada", label: "Descartadas" },
];

const estadoBadge: Record<
  TransaccionBancaria["estadoMatch"],
  { tone: "green" | "amber" | "red" | "slate"; label: string; icon: React.ReactNode }
> = {
  auto: { tone: "green", label: "Listo p/ aprobar", icon: <Check size={12} /> },
  revision: { tone: "amber", label: "A revisar", icon: <CircleHelp size={12} /> },
  "sin-match": { tone: "slate", label: "Sin match", icon: <CircleAlert size={12} /> },
  duplicado: { tone: "red", label: "Posible duplicado", icon: <ShieldAlert size={12} /> },
};

export function MatchTable() {
  const { state, aprobarTransaccion, vincularTransaccion, descartarTransaccion } = useAppStore();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [bancoFiltro, setBancoFiltro] = useState("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [justApproved, setJustApproved] = useState<Set<string>>(new Set());
  const [mostrarReglas, setMostrarReglas] = useState(false);
  const [mostrarModalRegla, setMostrarModalRegla] = useState(false);

  const unidadById = useMemo(
    () => new Map(state.unidades.map((u) => [u.id, u])),
    [state.unidades]
  );
  const consorcioById = useMemo(
    () => new Map(state.consorcios.map((c) => [c.id, c])),
    [state.consorcios]
  );

  const bancos = useMemo(
    () => Array.from(new Set(state.transacciones.map((t) => t.banco))).sort(),
    [state.transacciones]
  );

  const preFiltrado = state.transacciones.filter((t) => {
    if (bancoFiltro !== "todos" && t.banco !== bancoFiltro) return false;
    if (fechaDesde && t.fecha < fechaDesde) return false;
    if (fechaHasta && t.fecha > fechaHasta) return false;
    return true;
  });

  const counts: Record<Filtro, number> = {
    todas: preFiltrado.filter((t) => !t.descartada).length,
    auto: preFiltrado.filter((t) => !t.descartada && t.estadoMatch === "auto").length,
    revision: preFiltrado.filter((t) => !t.descartada && t.estadoMatch === "revision").length,
    "sin-match": preFiltrado.filter((t) => !t.descartada && t.estadoMatch === "sin-match").length,
    duplicado: preFiltrado.filter((t) => !t.descartada && t.estadoMatch === "duplicado").length,
    descartada: preFiltrado.filter((t) => t.descartada).length,
  };

  const filtered = preFiltrado.filter((t) => {
    if (filtro === "descartada") return t.descartada;
    if (t.descartada) return false;
    if (filtro === "todas") return true;
    return t.estadoMatch === filtro;
  });

  function aprobar(id: string) {
    aprobarTransaccion(id);
    setJustApproved((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      setJustApproved((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1000);
  }

  return (
    <div className="space-y-4">
      <Card className="animate-fade-in-up">
        <CardHeader
          title="Transacciones detectadas"
          subtitle="Revisá las coincidencias sugeridas por la IA y aprobá con un clic"
          action={
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMostrarReglas((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ListChecks size={13} />
                Reglas activas ({state.reglas.length})
              </button>
              <button
                onClick={() => setMostrarModalRegla(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                <ListPlus size={13} />
                Crear regla recurrente
              </button>
            </div>
          }
        />

        {mostrarReglas ? (
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/60">
            {state.reglas.length === 0 ? (
              <p className="text-xs text-slate-400">Todavía no creaste ninguna regla recurrente.</p>
            ) : (
              <ul className="space-y-2">
                {state.reglas.map((r) => {
                  const unidad = unidadById.get(r.unidadId);
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs shadow-sm dark:bg-slate-800"
                    >
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {r.nombre}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        patrón: <code className="text-slate-700 dark:text-slate-300">&quot;{r.patron}&quot;</code>
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        → {unidad ? `${unidad.unidad} · ${unidad.titular}` : "unidad eliminada"}
                      </span>
                      <Badge tone="blue">{r.vecesAplicada} aplicaciones</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          {filtros.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filtro === f.id
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {f.label} ({counts[f.id]})
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Desde
            </label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Hasta
            </label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Banco de origen
            </label>
            <select
              value={bancoFiltro}
              onChange={(e) => setBancoFiltro(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="todos">Todos los bancos</option>
              {bancos.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          {(fechaDesde || fechaHasta || bancoFiltro !== "todos") && (
            <button
              onClick={() => {
                setFechaDesde("");
                setFechaHasta("");
                setBancoFiltro("todos");
              }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Mobile: tarjetas */}
        <div className="space-y-3 p-4 sm:hidden">
          {filtered.map((tx) => {
            const unidad = tx.unidadSugeridaId ? unidadById.get(tx.unidadSugeridaId) : null;
            const consorcio = consorcioById.get(tx.consorcioId);
            const badge = estadoBadge[tx.estadoMatch];
            const confianzaColor =
              tx.confianza >= 90 ? "bg-emerald-500" : tx.confianza >= 70 ? "bg-blue-500" : "bg-amber-500";
            const isJustApproved = justApproved.has(tx.id);

            return (
              <div
                key={tx.id}
                className={`rounded-xl border border-slate-200 p-3.5 dark:border-slate-800 ${
                  isJustApproved ? "animate-conciliia-flash" : ""
                } ${tx.descartada ? "opacity-50" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{tx.banco}</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {formatDate(tx.fecha)}
                      {tx.reglaAplicadaId ? (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-blue-500 dark:text-blue-400">
                          <ListChecks size={10} /> por regla
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {tx.descartada ? (
                    <Badge tone="slate" icon={<Ban size={12} />}>
                      Descartada
                    </Badge>
                  ) : tx.aprobado ? (
                    <Badge tone="green" icon={<Check size={12} />}>
                      <span className={isJustApproved ? "inline-block animate-conciliia-pop" : "inline-block"}>
                        Conciliado
                      </span>
                    </Badge>
                  ) : (
                    <Badge tone={badge.tone} icon={badge.icon}>
                      {badge.label}
                    </Badge>
                  )}
                </div>

                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{tx.descripcionCruda}</p>

                <div className="mt-2 flex items-center justify-between">
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {formatARS(tx.monto)}
                    {tx.esPagoParcial ? (
                      <span className="ml-1.5 text-[11px] font-normal text-amber-600 dark:text-amber-400">
                        Pago parcial
                      </span>
                    ) : null}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full ${confianzaColor}`}
                        style={{ width: `${tx.confianza}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      {tx.confianza}%
                    </span>
                  </div>
                </div>

                <div className="mt-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                  {unidad ? (
                    <>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {unidad.unidad} · {consorcio?.nombre}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{unidad.titular}</p>
                    </>
                  ) : tx.sugerenciasAlternativas && tx.sugerenciasAlternativas.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        Sugerencias basadas en historial:
                      </p>
                      {tx.sugerenciasAlternativas.map((s) => {
                        const su = unidadById.get(s.unidadId);
                        if (!su) return null;
                        return (
                          <div
                            key={s.unidadId}
                            className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs dark:bg-slate-800"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-700 dark:text-slate-200">
                                {su.unidad} · {su.titular}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {s.confianza}% — {s.motivo}
                              </p>
                            </div>
                            <button
                              onClick={() => vincularTransaccion(tx.id, s.unidadId, s.confianza, s.motivo)}
                              className="flex shrink-0 items-center gap-1 rounded-md bg-white px-2 py-1 font-medium text-blue-600 ring-1 ring-inset ring-blue-200 hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-blue-500/30 dark:hover:bg-blue-500/10"
                            >
                              <Link2 size={11} />
                              Vincular
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Sin sugerencia de unidad</span>
                  )}
                  {tx.motivoAlerta ? (
                    <p className="mt-1.5 flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                      <CircleAlert size={12} className="mt-0.5 shrink-0" />
                      {tx.motivoAlerta}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3">
                  {tx.descartada ? null : tx.aprobado ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <Check size={14} className={isJustApproved ? "animate-conciliia-pop" : ""} />
                      Conciliado
                    </span>
                  ) : tx.estadoMatch === "duplicado" ? (
                    <button
                      type="button"
                      onClick={() => descartarTransaccion(tx.id)}
                      className="flex w-full items-center justify-center gap-1 rounded-lg border border-rose-300 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      <Ban size={13} />
                      Marcar duplicado
                    </button>
                  ) : unidad ? (
                    <button
                      type="button"
                      onClick={() => aprobar(tx.id)}
                      className="flex w-full items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      <Check size={13} />
                      Aprobar match
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Vinculá una unidad para poder aprobar</span>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              No hay transacciones en esta categoría.
            </p>
          ) : null}
        </div>

        {/* Desktop: tabla */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="px-5 py-3 font-medium">Transacción</th>
                <th className="px-5 py-3 font-medium">Monto</th>
                <th className="px-5 py-3 font-medium">Unidad sugerida</th>
                <th className="px-5 py-3 font-medium">Confianza IA</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((tx) => {
                const unidad = tx.unidadSugeridaId ? unidadById.get(tx.unidadSugeridaId) : null;
                const consorcio = consorcioById.get(tx.consorcioId);
                const badge = estadoBadge[tx.estadoMatch];
                const confianzaColor =
                  tx.confianza >= 90
                    ? "bg-emerald-500"
                    : tx.confianza >= 70
                      ? "bg-blue-500"
                      : "bg-amber-500";
                const isJustApproved = justApproved.has(tx.id);

                return (
                  <tr
                    key={tx.id}
                    className={`align-top hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                      isJustApproved ? "animate-conciliia-flash" : ""
                    } ${tx.descartada ? "opacity-50" : ""}`}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {tx.banco}
                      </p>
                      <p className="mt-0.5 max-w-xs text-xs text-slate-500 dark:text-slate-400">
                        {tx.descripcionCruda}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                        {formatDate(tx.fecha)}
                        {tx.reglaAplicadaId ? (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-blue-500 dark:text-blue-400">
                            <ListChecks size={10} /> por regla
                          </span>
                        ) : null}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-slate-100">
                      {formatARS(tx.monto)}
                      {tx.esPagoParcial ? (
                        <p className="mt-0.5 text-[11px] font-normal text-amber-600 dark:text-amber-400">
                          Pago parcial
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5">
                      {unidad ? (
                        <>
                          <p className="font-medium text-slate-800 dark:text-slate-200">
                            {unidad.unidad} · {consorcio?.nombre}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {unidad.titular}
                          </p>
                        </>
                      ) : tx.sugerenciasAlternativas && tx.sugerenciasAlternativas.length > 0 ? (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            Sugerencias basadas en historial:
                          </p>
                          {tx.sugerenciasAlternativas.map((s) => {
                            const su = unidadById.get(s.unidadId);
                            if (!su) return null;
                            return (
                              <div
                                key={s.unidadId}
                                className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs dark:bg-slate-800"
                              >
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-slate-700 dark:text-slate-200">
                                    {su.unidad} · {su.titular}
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    {s.confianza}% — {s.motivo}
                                  </p>
                                </div>
                                <button
                                  onClick={() =>
                                    vincularTransaccion(tx.id, s.unidadId, s.confianza, s.motivo)
                                  }
                                  className="flex shrink-0 items-center gap-1 rounded-md bg-white px-2 py-1 font-medium text-blue-600 ring-1 ring-inset ring-blue-200 hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400 dark:ring-blue-500/30 dark:hover:bg-blue-500/10"
                                >
                                  <Link2 size={11} />
                                  Vincular
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Sin sugerencia</span>
                      )}
                      {tx.motivoAlerta ? (
                        <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                          <CircleAlert size={12} className="mt-0.5 shrink-0" />
                          {tx.motivoAlerta}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full ${confianzaColor}`}
                            style={{ width: `${tx.confianza}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                          {tx.confianza}%
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {tx.descartada ? (
                        <Badge tone="slate" icon={<Ban size={12} />}>
                          Descartada
                        </Badge>
                      ) : tx.aprobado ? (
                        <Badge tone="green" icon={<Check size={12} />}>
                          <span className={isJustApproved ? "inline-block animate-conciliia-pop" : "inline-block"}>
                            Conciliado
                          </span>
                        </Badge>
                      ) : (
                        <Badge tone={badge.tone} icon={badge.icon}>
                          {badge.label}
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {tx.descartada ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : tx.aprobado ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <Check size={14} className={isJustApproved ? "animate-conciliia-pop" : ""} />
                          Conciliado
                        </span>
                      ) : tx.estadoMatch === "duplicado" ? (
                        <button
                          type="button"
                          onClick={() => descartarTransaccion(tx.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-500/10"
                        >
                          <Ban size={13} />
                          Marcar duplicado
                        </button>
                      ) : unidad ? (
                        <button
                          type="button"
                          onClick={() => aprobar(tx.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          <Check size={13} />
                          Aprobar match
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Vinculá una unidad</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">
                    No hay transacciones en esta categoría.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {mostrarModalRegla ? <CrearReglaModal onClose={() => setMostrarModalRegla(false)} /> : null}
    </div>
  );
}
