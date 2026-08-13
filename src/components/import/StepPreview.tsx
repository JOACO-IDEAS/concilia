"use client";

import { useMemo } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type {
  CampoDestino,
  CampoDestinoConfig,
  FilaImportacion,
  ProblemaValidacion,
} from "@/lib/import/types";
import { tieneErroresBloqueantes } from "@/lib/import/validation";
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, CircleHelp } from "lucide-react";

function inputClassName(severidad?: "error" | "warning") {
  if (severidad === "error") return "border-rose-300 dark:border-rose-500/40";
  if (severidad === "warning") return "border-amber-300 dark:border-amber-500/40";
  return "border-transparent hover:border-slate-200 dark:hover:border-slate-700";
}

export function StepPreview({
  filas,
  camposDestino,
  validarFila,
  onFilasChange,
  onVolver,
  onContinuar,
}: {
  filas: FilaImportacion[];
  camposDestino: CampoDestinoConfig[];
  validarFila: (valores: Record<CampoDestino, string>) => ProblemaValidacion[];
  onFilasChange: (filas: FilaImportacion[]) => void;
  onVolver: () => void;
  onContinuar: () => void;
}) {
  function recalcularFila(fila: FilaImportacion, campo: CampoDestino, valor: string): FilaImportacion {
    const valores = { ...fila.valores, [campo]: valor };
    const problemas = validarFila(valores);
    return {
      ...fila,
      valores,
      problemas,
      // si la edición resuelve los errores, se puede volver a incluir sola;
      // si aparece un error nuevo, se desmarca para forzar la revisión.
      incluida: !tieneErroresBloqueantes(problemas),
    };
  }

  function actualizarValor(id: string, campo: CampoDestino, valor: string) {
    onFilasChange(filas.map((f) => (f.id === id ? recalcularFila(f, campo, valor) : f)));
  }

  function alternarIncluida(id: string) {
    onFilasChange(filas.map((f) => (f.id === id ? { ...f, incluida: !f.incluida } : f)));
  }

  const resumen = useMemo(() => {
    const conError = filas.filter((f) => tieneErroresBloqueantes(f.problemas)).length;
    const conAdvertencia = filas.filter(
      (f) => !tieneErroresBloqueantes(f.problemas) && f.problemas.length > 0
    ).length;
    const listas = filas.filter((f) => f.incluida).length;
    return { conError, conAdvertencia, listas, total: filas.length };
  }, [filas]);

  const puedeContinuar = resumen.listas > 0;

  return (
    <Card className="animate-fade-in-up">
      <CardHeader
        title="Revisá y corregí antes de importar"
        subtitle="Los valores son editables — hacé clic en cualquier celda para corregirla"
      />

      <div className="flex flex-wrap gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
        <Badge tone="green" icon={<CircleCheck size={12} />}>
          {resumen.listas} de {resumen.total} listas para importar
        </Badge>
        {resumen.conAdvertencia > 0 ? (
          <Badge tone="amber" icon={<CircleHelp size={12} />}>
            {resumen.conAdvertencia} con advertencias
          </Badge>
        ) : null}
        {resumen.conError > 0 ? (
          <Badge tone="red" icon={<CircleAlert size={12} />}>
            {resumen.conError} con errores (no se importan hasta corregirlas)
          </Badge>
        ) : null}
      </div>

      {/* Mobile: tarjetas editables */}
      <div className="space-y-3 p-4 sm:hidden">
        {filas.map((fila) => {
          const bloqueada = tieneErroresBloqueantes(fila.problemas);
          return (
            <div
              key={fila.id}
              className={`rounded-xl border p-3.5 ${
                bloqueada
                  ? "border-rose-200 dark:border-rose-500/30"
                  : "border-slate-200 dark:border-slate-800"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={fila.incluida}
                    disabled={bloqueada}
                    onChange={() => alternarIncluida(fila.id)}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  Incluir en la importación
                </label>
                {bloqueada ? <Badge tone="red">Con errores</Badge> : null}
              </div>
              <div className="space-y-2.5">
                {camposDestino.map((campo) => {
                  const problema = fila.problemas.find((p) => p.campo === campo.campo);
                  return (
                    <div key={campo.campo}>
                      <label className="mb-0.5 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {campo.etiqueta}
                      </label>
                      <input
                        value={fila.valores[campo.campo]}
                        onChange={(e) => actualizarValor(fila.id, campo.campo, e.target.value)}
                        className={`w-full rounded-md border bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 dark:bg-slate-900 ${inputClassName(problema?.severidad)}`}
                      />
                      {problema ? (
                        <p
                          className={`mt-0.5 text-[11px] ${
                            problema.severidad === "error"
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {problema.mensaje}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: tabla editable */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <th className="w-10 px-4 py-2.5" />
              {camposDestino.map((c) => (
                <th key={c.campo} className="px-3 py-2.5 font-medium">
                  {c.etiqueta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filas.map((fila) => {
              const bloqueada = tieneErroresBloqueantes(fila.problemas);
              return (
                <tr key={fila.id} className={bloqueada ? "bg-rose-50/60 dark:bg-rose-500/5" : ""}>
                  <td className="px-4 py-2.5 align-top">
                    <input
                      type="checkbox"
                      checked={fila.incluida}
                      disabled={bloqueada}
                      onChange={() => alternarIncluida(fila.id)}
                      className="mt-1.5 h-3.5 w-3.5 rounded border-slate-300"
                    />
                  </td>
                  {camposDestino.map((campo) => {
                    const problema = fila.problemas.find((p) => p.campo === campo.campo);
                    return (
                      <td key={campo.campo} className="min-w-[150px] px-3 py-2 align-top">
                        <input
                          value={fila.valores[campo.campo]}
                          onChange={(e) => actualizarValor(fila.id, campo.campo, e.target.value)}
                          className={`w-full rounded-md border bg-transparent px-2 py-1 text-xs outline-none focus:border-blue-500 ${inputClassName(problema?.severidad)}`}
                        />
                        {problema ? (
                          <p
                            className={`mt-0.5 text-[10px] ${
                              problema.severidad === "error"
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {problema.mensaje}
                          </p>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 dark:border-slate-800">
        <button
          onClick={onVolver}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ArrowLeft size={14} /> Volver
        </button>
        <button
          onClick={onContinuar}
          disabled={!puedeContinuar}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continuar <ArrowRight size={14} />
        </button>
      </div>
    </Card>
  );
}
