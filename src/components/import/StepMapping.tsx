"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import type {
  ArchivoParseado,
  CampoDestino,
  CampoDestinoConfig,
  FilaImportacion,
  MapeoColumnas,
  ProblemaValidacion,
} from "@/lib/import/types";
import { tieneErroresBloqueantes } from "@/lib/import/validation";
import { ArrowLeft, ArrowRight, CircleAlert } from "lucide-react";

export function StepMapping({
  archivo,
  mapeoInicial,
  camposDestino,
  validarFila,
  onVolver,
  onContinuar,
}: {
  archivo: ArchivoParseado;
  mapeoInicial: MapeoColumnas;
  camposDestino: CampoDestinoConfig[];
  validarFila: (valores: Record<CampoDestino, string>) => ProblemaValidacion[];
  onVolver: () => void;
  onContinuar: (mapeo: MapeoColumnas, filas: FilaImportacion[]) => void;
}) {
  const [mapeo, setMapeo] = useState<MapeoColumnas>(mapeoInicial);

  const columnaIndex = useMemo(() => {
    const idx = new Map<string, number>();
    archivo.headers.forEach((h, i) => idx.set(h, i));
    return idx;
  }, [archivo.headers]);

  function muestra(header: string | undefined): string {
    if (!header) return "";
    const i = columnaIndex.get(header);
    if (i === undefined) return "";
    const valores = archivo.filas
      .slice(0, 2)
      .map((f) => f[i])
      .filter(Boolean);
    return valores.join(" · ") || "(vacío)";
  }

  const camposRequeridosSinMapear = camposDestino.filter((c) => c.requerido && !mapeo[c.campo]);
  const puedeContinuar = camposRequeridosSinMapear.length === 0;

  function continuar() {
    const filas: FilaImportacion[] = archivo.filas.map((fila, i) => {
      const valores = {} as Record<CampoDestino, string>;
      for (const campo of camposDestino) {
        const header = mapeo[campo.campo];
        const idx = header ? columnaIndex.get(header) : undefined;
        valores[campo.campo] = idx !== undefined ? (fila[idx] ?? "").trim() : "";
      }
      const problemas = validarFila(valores);
      return {
        id: `fila-${i}`,
        valores,
        problemas,
        incluida: !tieneErroresBloqueantes(problemas),
      };
    });
    onContinuar(mapeo, filas);
  }

  return (
    <Card className="animate-fade-in-up">
      <CardHeader
        title="Mapeá las columnas de tu archivo"
        subtitle={`${archivo.nombreArchivo} · ${archivo.filas.length} filas detectadas`}
      />
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {camposDestino.map((campo) => (
          <div
            key={campo.campo}
            className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center"
          >
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">
                {campo.etiqueta}
                {campo.requerido ? <span className="text-rose-500">*</span> : null}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{campo.ayuda}</p>
            </div>
            <ArrowRight size={14} className="hidden text-slate-300 sm:block" />
            <div>
              <select
                value={mapeo[campo.campo] ?? ""}
                onChange={(e) =>
                  setMapeo((prev) => ({ ...prev, [campo.campo]: e.target.value || undefined }))
                }
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 dark:bg-slate-800 ${
                  campo.requerido && !mapeo[campo.campo]
                    ? "border-rose-300 dark:border-rose-500/40"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              >
                <option value="">{campo.requerido ? "Sin mapear (obligatorio)" : "No mapear"}</option>
                {archivo.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              {mapeo[campo.campo] ? (
                <p className="mt-1 truncate text-[11px] text-slate-400">
                  Ej: {muestra(mapeo[campo.campo])}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {!puedeContinuar ? (
        <div className="mx-5 mb-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
          <CircleAlert size={14} className="shrink-0" />
          Mapeá los campos obligatorios para continuar:{" "}
          {camposRequeridosSinMapear.map((c) => c.etiqueta).join(", ")}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 dark:border-slate-800">
        <button
          onClick={onVolver}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ArrowLeft size={14} /> Volver
        </button>
        <button
          onClick={continuar}
          disabled={!puedeContinuar}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continuar <ArrowRight size={14} />
        </button>
      </div>
    </Card>
  );
}
