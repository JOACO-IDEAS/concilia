"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import {
  previsualizarExtractoPDF,
  confirmarExtractoPDF,
  type MovimientoPreviewDTO,
} from "@/app/conciliacion/statement-actions";
import { UploadCloud, FileWarning, Loader2, CircleCheck, Check, Sparkles, X } from "lucide-react";

type Estado = "idle" | "leyendo" | "listo" | "hecho";

/**
 * Entrada de datos de "Pagos" — dropzone universal (PDF/imagen/CSV/Excel) +
 * un solo clic para confirmar. Cero Ficción: no hay checkboxes por fila — la
 * IA ya decidió qué es un cobro válido (`esEgreso`/`yaImportado` filtrados),
 * así que se auto-selecciona todo lo importable y se muestra un resumen, no
 * una lista para auditar línea por línea (mismo patrón que ya se usa en la
 * Bandeja de Trabajo). Reutiliza `previsualizarExtractoPDF`/
 * `confirmarExtractoPDF` tal cual.
 */
export function StatementIngestionPanel() {
  const { showToast } = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [estado, setEstado] = useState<Estado>("idle");
  const [confirmando, setConfirmando] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [bankName, setBankName] = useState<string | null>(null);
  const [usedAI, setUsedAI] = useState(false);
  const [movimientos, setMovimientos] = useState<MovimientoPreviewDTO[]>([]);
  const [resultado, setResultado] = useState<{
    creados: number;
    matched: number;
    unmatched: number;
  } | null>(null);

  const importables = useMemo(
    () => movimientos.filter((m) => !m.esEgreso && !m.yaImportado),
    [movimientos]
  );

  const procesar = useCallback(async (archivo: File | undefined) => {
    if (!archivo) return;
    setEstado("leyendo");
    setError(null);
    const formData = new FormData();
    formData.set("file", archivo);

    // Red de seguridad del lado del cliente: pase lo que pase en el servidor
    // (la IA colgada, cold start, lo que sea), la UI nunca debe quedar
    // atascada más de 45s — un poco por encima del timeout de 40s del
    // servidor, para que sea ese el que dispare primero con su propio
    // mensaje de error.
    let venciTimeout = false;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        venciTimeout = true;
        reject(new Error("timeout"));
      }, 45000);
    });

    let r;
    try {
      r = await Promise.race([previsualizarExtractoPDF(formData), timeoutPromise]);
    } catch {
      setEstado("idle");
      setError(
        venciTimeout
          ? "La IA tardó demasiado en analizar el archivo. Probá de nuevo en unos segundos."
          : "No se pudo leer el archivo."
      );
      return;
    }

    if (!r.ok || !r.movimientos) {
      setEstado("idle");
      setError(r.error ?? "No se pudo leer el archivo.");
      return;
    }
    setFileName(r.fileName ?? archivo.name);
    setBankName(r.bankName ?? null);
    setUsedAI(r.usedAI ?? false);
    setMovimientos(r.movimientos);
    setEstado("listo");
  }, []);

  async function confirmar() {
    setConfirmando(true);
    const r = await confirmarExtractoPDF(
      fileName,
      importables.map((m) => ({
        fecha: m.fecha,
        amount: m.amount,
        concept: m.concept,
        payerIdentifier: m.payerIdentifier,
        externalId: m.externalId,
        lineaOriginal: m.lineaOriginal,
      })),
      bankName
    );
    setResultado({ creados: r.creados, matched: r.matched, unmatched: r.unmatched });
    setConfirmando(false);
    setEstado("hecho");
    showToast(
      "Extracto importado",
      `${r.matched} conciliados automáticamente · ${r.unmatched} a revisar abajo`
    );
    router.refresh();
  }

  function reiniciar() {
    setEstado("idle");
    setConfirmando(false);
    setError(null);
    setFileName("");
    setBankName(null);
    setUsedAI(false);
    setMovimientos([]);
    setResultado(null);
  }

  if (estado === "hecho" && resultado) {
    return (
      <Card className="animate-fade-in-up">
        <CardHeader title="Extracto importado" subtitle={fileName} />
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <Check size={26} />
          </div>
          <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {resultado.creados} movimiento{resultado.creados === 1 ? "" : "s"} importado
            {resultado.creados === 1 ? "" : "s"}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge tone="green">{resultado.matched} conciliados</Badge>
            {resultado.unmatched > 0 ? (
              <Badge tone="amber">{resultado.unmatched} necesitan aprobación</Badge>
            ) : null}
          </div>
          <Button variant="outline" onClick={reiniciar} className="mt-2">
            Cargar otro extracto
          </Button>
        </div>
      </Card>
    );
  }

  if (estado === "listo") {
    return (
      <Card className="animate-fade-in-up">
        <CardHeader
          title="Movimientos detectados"
          subtitle={`${fileName}${bankName ? ` · ${bankName}` : ""}`}
          action={
            usedAI ? (
              <Badge tone="blue" icon={<Sparkles size={12} />}>
                Procesado por IA
              </Badge>
            ) : (
              <Badge tone="slate">Parser local</Badge>
            )
          }
        />
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <CircleCheck size={22} />
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {movimientos.length} movimiento{movimientos.length === 1 ? "" : "s"} detectado
            {movimientos.length === 1 ? "" : "s"} · {importables.length} listo
            {importables.length === 1 ? "" : "s"} para importar como cobro
          </p>
          {movimientos.length - importables.length > 0 ? (
            <p className="text-xs text-slate-400">
              {movimientos.length - importables.length} descartado
              {movimientos.length - importables.length === 1 ? "" : "s"} (egresos o ya importados)
            </p>
          ) : null}
          <div className="mt-2 flex items-center gap-2">
            <Button variant="ghost" onClick={reiniciar}>
              <X size={15} />
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={importables.length === 0 || confirmando}>
              {confirmando ? <Loader2 className="animate-spin" /> : <Check />}
              Confirmar e importar {importables.length}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in-up">
      <CardHeader
        title="Cargar extracto"
        subtitle="PDF, imagen, CSV o Excel de cualquier banco o billetera — la IA detecta los movimientos"
      />
      <div className="p-5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (estado !== "leyendo") setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (estado !== "leyendo") procesar(e.dataTransfer.files?.[0]);
          }}
          onClick={() => estado !== "leyendo" && inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
            estado !== "leyendo" ? "cursor-pointer" : "cursor-default"
          } ${
            isDragging
              ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10"
              : "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf,.png,image/png,.jpg,.jpeg,image/jpeg,.csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => procesar(e.target.files?.[0])}
          />
          {estado === "leyendo" ? (
            <>
              <Loader2 size={26} className="animate-spin text-blue-600 dark:text-blue-400" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                IA analizando formato del banco…
              </p>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                <UploadCloud size={22} />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Arrastrá tu extracto acá o hacé clic para elegir un archivo
              </p>
            </>
          )}
        </div>

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
            <FileWarning size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
