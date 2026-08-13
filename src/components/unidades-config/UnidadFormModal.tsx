"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { crearUnidad, actualizarUnidad, type UnitDTO } from "@/app/unidades-config/actions";

export function UnidadFormModal({
  organizationId,
  unidad,
  onClose,
  onGuardado,
}: {
  organizationId: string;
  unidad?: UnitDTO; // undefined = alta, presente = edición
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [code, setCode] = useState(unidad?.code ?? "");
  const [coefficient, setCoefficient] = useState(unidad?.coefficient?.toString() ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  async function guardar() {
    if (!code.trim()) {
      setError("El código de unidad es obligatorio.");
      return;
    }
    setGuardando(true);
    setError(null);
    const coef = coefficient.trim() ? Number(coefficient.replace(",", ".")) : null;
    const r = unidad
      ? await actualizarUnidad(unidad.id, { code, coefficient: coef })
      : await crearUnidad({ organizationId, code, coefficient: coef });
    setGuardando(false);
    if (r.ok) onGuardado();
    else setError(r.error ?? "No se pudo guardar la unidad.");
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
              <Building2 size={16} />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {unidad ? "Editar unidad" : "Nueva unidad"}
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
              Código de unidad *
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ej. 3A"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Coeficiente (%) — opcional
            </label>
            <input
              value={coefficient}
              onChange={(e) => setCoefficient(e.target.value)}
              placeholder="ej. 2.35"
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
