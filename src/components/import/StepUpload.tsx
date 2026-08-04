"use client";

import { useCallback, useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { UploadCloud, FileWarning, Loader2, FileSpreadsheet } from "lucide-react";
import { parsearArchivo, ArchivoNoSoportadoError } from "@/lib/import/parse-file";
import { sugerirMapeo } from "@/lib/import/validation";
import type { ArchivoParseado, MapeoColumnas } from "@/lib/import/types";

type Estado = "idle" | "procesando" | "error";

export function StepUpload({
  onArchivoParseado,
}: {
  onArchivoParseado: (archivo: ArchivoParseado, mapeoSugerido: MapeoColumnas) => void;
}) {
  const [estado, setEstado] = useState<Estado>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const procesar = useCallback(
    async (archivo: File | undefined) => {
      if (!archivo) return;
      setEstado("procesando");
      setError(null);
      try {
        const parseado = await parsearArchivo(archivo);
        const mapeoSugerido = sugerirMapeo(parseado.headers);
        onArchivoParseado(parseado, mapeoSugerido);
      } catch (e) {
        setEstado("error");
        setError(
          e instanceof ArchivoNoSoportadoError || e instanceof Error
            ? e.message
            : "No se pudo leer el archivo. Verificá que no esté dañado o protegido con contraseña."
        );
      }
    },
    [onArchivoParseado]
  );

  return (
    <Card className="animate-fade-in-up">
      <CardHeader
        title="Importar consorcios desde Excel o CSV"
        subtitle="Subí una planilla con tus clientes y te ayudamos a mapear las columnas antes de cargarlos"
      />
      <div className="p-5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (estado !== "procesando") setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (estado !== "procesando") procesar(e.dataTransfer.files?.[0]);
          }}
          onClick={() => estado !== "procesando" && inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
            estado !== "procesando" ? "cursor-pointer" : "cursor-default"
          } ${
            isDragging
              ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10"
              : "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => procesar(e.target.files?.[0])}
          />

          {estado === "procesando" ? (
            <>
              <Loader2 size={26} className="animate-spin text-blue-600 dark:text-blue-400" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Leyendo el archivo…
              </p>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                <UploadCloud size={22} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Arrastrá tu planilla acá o hacé clic para elegir un archivo
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Formatos soportados: .xlsx y .csv · hasta 500 filas por archivo
                </p>
              </div>
            </>
          )}
        </div>

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
            <FileWarning size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <FileSpreadsheet size={14} className="mt-0.5 shrink-0" />
          <span>
            La primera fila del archivo debe tener los encabezados de columna (ej. &quot;Nombre&quot;,
            &quot;CUIT&quot;, &quot;Email&quot;). En el próximo paso vas a poder elegir qué columna
            corresponde a cada dato.
          </span>
        </div>
      </div>
    </Card>
  );
}
