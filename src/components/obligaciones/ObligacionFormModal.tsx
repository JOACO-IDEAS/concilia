"use client";

import { useEffect, useState } from "react";
import { Loader2, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  crearObligacion,
  actualizarObligacion,
  type ObligationDTO,
} from "@/app/unidades-config/obligaciones-actions";

function aInputDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function aInputPeriodo(iso: string): string {
  return iso.slice(0, 7);
}

export function ObligacionFormModal({
  unitId,
  obligacion,
  onClose,
  onGuardado,
}: {
  unitId: string;
  obligacion?: ObligationDTO; // undefined = alta, presente = edición
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [period, setPeriod] = useState(obligacion ? aInputPeriodo(obligacion.period) : "");
  const [amount, setAmount] = useState(obligacion?.amount.toString() ?? "");
  const [concept, setConcept] = useState(obligacion?.concept ?? "");
  const [dueDate, setDueDate] = useState(aInputDate(obligacion?.dueDate ?? null));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  async function guardar() {
    const montoNumero = Number(amount.replace(",", "."));
    if (!period.trim()) {
      setError("El período es obligatorio.");
      return;
    }
    if (!Number.isFinite(montoNumero) || montoNumero <= 0) {
      setError("El importe debe ser un número mayor a cero.");
      return;
    }
    setGuardando(true);
    setError(null);
    const r = obligacion
      ? await actualizarObligacion(obligacion.id, {
          period,
          amount: montoNumero,
          concept: concept || null,
          dueDate: dueDate || null,
        })
      : await crearObligacion({
          unitId,
          period,
          amount: montoNumero,
          concept: concept || null,
          dueDate: dueDate || null,
        });
    setGuardando(false);
    if (r.ok) onGuardado();
    else setError(r.error ?? "No se pudo guardar la obligación.");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm animate-toast-in rounded-2xl bg-white shadow-xl dark:bg-slate-900"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
              <Receipt size={16} />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {obligacion ? "Editar obligación" : "Nueva obligación"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Período *
            </label>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Importe *
            </label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="ej. 145000"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Concepto — opcional
            </label>
            <input
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="ej. Expensas Agosto 2026"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Vencimiento — opcional
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? <Loader2 size={14} className="animate-spin" /> : null}
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
