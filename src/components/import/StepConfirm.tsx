"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { importarOrganizaciones, type ResultadoImportacion } from "@/app/importar/actions";
import type { FilaImportacion } from "@/lib/import/types";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  RotateCcw,
  DatabaseZap,
  Building2,
} from "lucide-react";

export function StepConfirm({
  filas,
  resultado,
  onResultado,
  onVolver,
  onReiniciar,
}: {
  filas: FilaImportacion[];
  resultado: ResultadoImportacion | null;
  onResultado: (r: ResultadoImportacion | null) => void;
  onVolver: () => void;
  onReiniciar: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [errorConexion, setErrorConexion] = useState<string | null>(null);
  const { showToast } = useToast();

  const incluidas = filas.filter((f) => f.incluida);

  async function confirmar() {
    setEnviando(true);
    setErrorConexion(null);
    try {
      const payload = incluidas.map((f) => ({
        name: f.valores.name,
        taxId: f.valores.tax_id,
        contactName: f.valores.contact_name,
        contactEmail: f.valores.contact_email,
        contactPhone: f.valores.contact_phone,
        billingEmail: f.valores.billing_email,
        cbuAlias: f.valores.cbu_alias,
      }));
      const r = await importarOrganizaciones(payload);
      onResultado(r);
      if (r.ok) {
        showToast(
          "Importación completada",
          `${r.creadas} creadas · ${r.actualizadas} actualizadas`
        );
      }
    } catch (e) {
      // La Server Action puede rechazar de punta a punta — por ejemplo si
      // todavía no hay una base de datos conectada (DATABASE_URL sin
      // configurar). Se muestra un mensaje claro en vez de romper la UI.
      setErrorConexion(
        e instanceof Error
          ? e.message
          : "No se pudo conectar con la base de datos. Verificá que esté configurada."
      );
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    return (
      <Card className="animate-fade-in-up">
        <CardHeader title="Resultado de la importación" />
        <div className="p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-emerald-50 p-4 text-center dark:bg-emerald-500/10">
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                {resultado.creadas}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400/80">Creadas</p>
            </div>
            <div className="rounded-lg bg-blue-50 p-4 text-center dark:bg-blue-500/10">
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                {resultado.actualizadas}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400/80">Actualizadas</p>
            </div>
            <div className="rounded-lg bg-rose-50 p-4 text-center dark:bg-rose-500/10">
              <p className="text-2xl font-bold text-rose-700 dark:text-rose-400">
                {resultado.errores.length}
              </p>
              <p className="text-xs text-rose-600 dark:text-rose-400/80">Con error</p>
            </div>
          </div>

          {resultado.errores.length > 0 ? (
            <div className="mt-4 space-y-1.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Detalle de errores:
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-900">
                {resultado.errores.map((e) => (
                  <li key={e.fila} className="text-rose-600 dark:text-rose-400">
                    Fila {e.fila} ({e.organizacion}): {e.mensaje}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              onClick={onReiniciar}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <RotateCcw size={14} /> Importar otro archivo
            </button>
            <Link
              href="/consorcios"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Building2 size={14} /> Ver consorcios
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in-up">
      <CardHeader
        title="Confirmar importación"
        subtitle="Última revisión antes de guardar los datos"
      />
      <div className="p-5">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Se van a crear o actualizar <strong>{incluidas.length}</strong> organizaciones
          {filas.length !== incluidas.length ? (
            <>
              {" "}
              ({filas.length - incluidas.length} fila
              {filas.length - incluidas.length === 1 ? "" : "s"} quedaron afuera por tener
              errores sin corregir)
            </>
          ) : null}
          . Los consorcios que ya existan (mismo CUIT) se actualizan en vez de duplicarse.
        </p>

        {errorConexion ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
            <DatabaseZap size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">No se pudo guardar en la base de datos</p>
              <p className="mt-0.5 text-xs opacity-90">{errorConexion}</p>
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={onVolver}
            disabled={enviando}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ArrowLeft size={14} /> Volver
          </button>
          <button
            onClick={confirmar}
            disabled={enviando || incluidas.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enviando ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            {enviando ? "Guardando…" : `Confirmar e importar ${incluidas.length}`}
          </button>
        </div>
      </div>
    </Card>
  );
}
