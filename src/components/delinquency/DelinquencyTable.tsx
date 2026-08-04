"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatARS, formatDate } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import type { UnidadFuncional } from "@/lib/types";
import { MessageCircle, Check, Phone, PartyPopper, Mail, Loader2 } from "lucide-react";
import { WhatsAppModal } from "./WhatsAppModal";
import { useToast } from "@/components/ui/Toast";

export function DelinquencyTable({ unidades }: { unidades: UnidadFuncional[] }) {
  const { state, enviarRecordatorios } = useAppStore();
  const { showToast } = useToast();
  const [selected, setSelected] = useState<UnidadFuncional | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [enviandoMasivo, setEnviandoMasivo] = useState<"whatsapp" | "email" | null>(null);

  const consorcioById = useMemo(
    () => new Map(state.consorcios.map((c) => [c.id, c])),
    [state.consorcios]
  );

  const ordered = [...unidades].sort((a, b) => b.diasAtraso - a.diasAtraso);

  function toggleUno(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTodos() {
    if (checked.size === ordered.length) {
      setChecked(new Set());
    } else {
      setChecked(new Set(ordered.map((u) => u.id)));
    }
  }

  function enviarMasivo(canal: "whatsapp" | "email") {
    const ids = Array.from(checked);
    if (ids.length === 0) return;
    setEnviandoMasivo(canal);
    window.setTimeout(() => {
      enviarRecordatorios(ids, canal);
      setEnviandoMasivo(null);
      setChecked(new Set());
      showToast(
        `${ids.length} recordatorio${ids.length === 1 ? "" : "s"} por ${canal === "whatsapp" ? "WhatsApp" : "email"} despachado${ids.length === 1 ? "" : "s"}`,
        "Cada unidad recibió su Magic Link de pago personalizado."
      );
    }, 1200);
  }

  if (ordered.length === 0) {
    return (
      <Card className="animate-fade-in-up">
        <CardHeader
          title="Unidades con expensas vencidas"
          subtitle="0 unidades requieren seguimiento de cobranza"
        />
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <PartyPopper size={22} />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            ¡Todas las unidades están al día! No hay morosidad pendiente.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="animate-fade-in-up">
        <CardHeader
          title="Unidades con expensas vencidas"
          subtitle={`${ordered.length} unidades requieren seguimiento de cobranza`}
        />

        {checked.size > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-5 py-3 dark:border-blue-500/20 dark:bg-blue-500/10">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
              {checked.size} unidad{checked.size === 1 ? "" : "es"} seleccionada
              {checked.size === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => enviarMasivo("whatsapp")}
                disabled={enviandoMasivo !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {enviandoMasivo === "whatsapp" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <MessageCircle size={13} />
                )}
                Enviar por WhatsApp
              </button>
              <button
                onClick={() => enviarMasivo("email")}
                disabled={enviandoMasivo !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-600 dark:hover:bg-slate-500"
              >
                {enviandoMasivo === "email" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Mail size={13} />
                )}
                Enviar por email
              </button>
            </div>
          </div>
        ) : null}

        {/* Mobile: tarjetas */}
        <div className="space-y-3 p-4 sm:hidden">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={checked.size === ordered.length}
              onChange={toggleTodos}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Seleccionar todas
          </label>

          {ordered.map((u) => {
            const consorcio = consorcioById.get(u.consorcioId);
            const severidad = u.diasAtraso >= 30 ? "red" : u.diasAtraso >= 10 ? "amber" : "slate";

            return (
              <div
                key={u.id}
                className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={checked.has(u.id)}
                    onChange={() => toggleUno(u.id)}
                    className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-slate-300"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {u.unidad} · {u.titular}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {consorcio?.nombre}
                        </p>
                      </div>
                      <Badge tone={severidad}>{u.diasAtraso} días</Badge>
                    </div>

                    <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
                      <Phone size={11} />
                      {u.telefono}
                    </p>

                    <div className="mt-2 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {formatARS(u.saldoPendiente)}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          expensa {formatARS(u.expensaMensual)} + interés {formatARS(u.interesAcumulado)}
                        </p>
                      </div>
                      {u.ultimoRecordatorio ? (
                        <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <Check size={11} className="text-emerald-500" />
                          {u.ultimoRecordatorio.canal === "whatsapp" ? "WhatsApp" : "Email"}
                        </span>
                      ) : null}
                    </div>

                    <button
                      onClick={() => setSelected(u)}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      <MessageCircle size={13} />
                      Enviar recordatorio
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: tabla */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="w-10 px-5 py-3">
                  <input
                    type="checkbox"
                    checked={checked.size === ordered.length}
                    onChange={toggleTodos}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                </th>
                <th className="px-5 py-3 font-medium">Unidad / Titular</th>
                <th className="px-5 py-3 font-medium">Consorcio</th>
                <th className="px-5 py-3 font-medium">Días de atraso</th>
                <th className="px-5 py-3 font-medium">Total adeudado</th>
                <th className="px-5 py-3 font-medium">Último recordatorio</th>
                <th className="px-5 py-3 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {ordered.map((u) => {
                const consorcio = consorcioById.get(u.consorcioId);
                const severidad =
                  u.diasAtraso >= 30 ? "red" : u.diasAtraso >= 10 ? "amber" : "slate";

                return (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3.5">
                      <input
                        type="checkbox"
                        checked={checked.has(u.id)}
                        onChange={() => toggleUno(u.id)}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {u.unidad} · {u.titular}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <Phone size={11} />
                        {u.telefono}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">
                      {consorcio?.nombre}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={severidad}>{u.diasAtraso} días</Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {formatARS(u.saldoPendiente)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        expensa {formatARS(u.expensaMensual)} + interés {formatARS(u.interesAcumulado)}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">
                      {u.ultimoRecordatorio ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Check size={12} className="text-emerald-500" />
                          {u.ultimoRecordatorio.canal === "whatsapp" ? "WhatsApp" : "Email"} ·{" "}
                          {formatDate(u.ultimoRecordatorio.fecha)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setSelected(u)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        <MessageCircle size={13} />
                        Enviar recordatorio
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {selected ? (
        <WhatsAppModal unidad={selected} onClose={() => setSelected(null)} />
      ) : null}
    </>
  );
}
