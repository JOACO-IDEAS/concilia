"use client";

import { useMemo, useState } from "react";
import { X, ListPlus } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";

export function CrearReglaModal({ onClose }: { onClose: () => void }) {
  const { state, crearRegla } = useAppStore();
  const { showToast } = useToast();
  const [nombre, setNombre] = useState("");
  const [patron, setPatron] = useState("");
  const [unidadId, setUnidadId] = useState("");

  const consorciosConUnidades = useMemo(
    () =>
      state.consorcios.map((c) => ({
        consorcio: c,
        unidades: state.unidades.filter((u) => u.consorcioId === c.id),
      })),
    [state.consorcios, state.unidades]
  );

  const previstas = useMemo(() => {
    if (!patron.trim()) return 0;
    const patronLower = patron.trim().toLowerCase();
    return state.transacciones.filter(
      (t) => !t.aprobado && !t.descartada && t.descripcionCruda.toLowerCase().includes(patronLower)
    ).length;
  }, [patron, state.transacciones]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !patron.trim() || !unidadId) return;
    crearRegla(nombre.trim(), patron.trim(), unidadId);
    showToast(
      "Regla de conciliación creada",
      previstas > 0
        ? `Se aplicó automáticamente a ${previstas} transacción(es) pendiente(s).`
        : "Se aplicará automáticamente a futuras transacciones que coincidan."
    );
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="flex max-h-[90vh] w-full max-w-md flex-col animate-toast-in overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-slate-900"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
              <ListPlus size={16} />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Nueva regla de conciliación recurrente
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Nombre de la regla
            </label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder='Ej: "Alquiler depto 4°B vía Mercado Pago"'
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Patrón a buscar en la descripción del extracto
            </label>
            <input
              value={patron}
              onChange={(e) => setPatron(e.target.value)}
              placeholder="Ej: GIMENEZ ROBERTO"
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            />
            {patron.trim() ? (
              <p className="mt-1 text-[11px] text-slate-400">
                Coincide con {previstas} transacción{previstas === 1 ? "" : "es"} pendiente
                {previstas === 1 ? "" : "s"} ahora mismo.
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Vincular siempre a la Unidad Funcional
            </label>
            <select
              value={unidadId}
              onChange={(e) => setUnidadId(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="" disabled>
                Seleccioná una unidad…
              </option>
              {consorciosConUnidades.map(({ consorcio, unidades }) => (
                <optgroup key={consorcio.id} label={consorcio.nombre}>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unidad} · {u.titular}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Crear regla
          </button>
        </div>
      </form>
    </div>
  );
}
