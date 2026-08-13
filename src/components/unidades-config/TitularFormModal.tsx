"use client";

import { useEffect, useState } from "react";
import { Loader2, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  agregarTitular,
  actualizarTitular,
  type UnitOwnerDTO,
} from "@/app/unidades-config/actions";
import type { UnitOccupantType } from "@/generated/prisma/enums";

export function TitularFormModal({
  unitId,
  titular,
  onClose,
  onGuardado,
}: {
  unitId: string;
  titular?: UnitOwnerDTO; // undefined = alta, presente = edición
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [fullName, setFullName] = useState(titular?.fullName ?? "");
  const [taxId, setTaxId] = useState(titular?.taxId ?? "");
  const [relationship, setRelationship] = useState<UnitOccupantType>(titular?.relationship ?? "OWNER");
  const [email, setEmail] = useState(titular?.email ?? "");
  const [phone, setPhone] = useState(titular?.phone ?? "");
  const [isPrimary, setIsPrimary] = useState(titular?.isPrimary ?? false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  async function guardar() {
    if (!fullName.trim()) {
      setError("El nombre del titular es obligatorio.");
      return;
    }
    setGuardando(true);
    setError(null);
    // En alta no se manda `isPrimary`: el server action decide el default
    // seguro (primario solo si es el primer titular activo de la unidad),
    // para no desplazar en silencio a un primario existente. En edición sí
    // se manda explícito, para poder promover/degradar a propósito.
    const r = titular
      ? await actualizarTitular(titular.id, {
          fullName,
          taxId: taxId || null,
          relationship,
          email: email || null,
          phone: phone || null,
          isPrimary,
        })
      : await agregarTitular(unitId, { fullName, taxId: taxId || null, relationship, email: email || null, phone: phone || null });
    setGuardando(false);
    if (r.ok) onGuardado();
    else setError(r.error ?? "No se pudo guardar el titular.");
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
              <User size={16} />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {titular ? "Editar titular" : "Nuevo titular"}
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
              Nombre completo *
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="ej. Gonzalo López"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              CUIT / CUIL — opcional pero recomendado
            </label>
            <input
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="ej. 20289900113"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Tipo de ocupante
            </label>
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as UnitOccupantType)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="OWNER">Propietario</option>
              <option value="TENANT">Inquilino</option>
            </select>
          </div>
          {titular ? (
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700"
              />
              Titular principal
              {isPrimary ? (
                <span className="text-xs text-slate-400">(desmarca al que hoy sea principal)</span>
              ) : null}
            </label>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Email
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Teléfono
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
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
