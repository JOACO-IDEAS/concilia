"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import {
  previsualizarExtractoPDF,
  confirmarExtractoPDF,
  type MovimientoPreviewDTO,
} from "@/app/conciliacion/statement-actions";
import {
  UploadCloud,
  FileWarning,
  Loader2,
  FileText,
  CircleCheck,
  CircleHelp,
  Ban,
  Check,
  Sparkles,
} from "lucide-react";

type Estado = "idle" | "leyendo" | "preview" | "hecho";

function formatMonto(amount: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(amount);
}

function formatFecha(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function StatementIngestionPanel({ onVerWebhooks }: { onVerWebhooks?: () => void }) {
  const { showToast } = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [estado, setEstado] = useState<Estado>("idle");
  const [confirmando, setConfirmando] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [bankName, setBankName] = useState<string | null>(null);
  const [usedAI, setUsedAI] = useState(false);
  const [movimientos, setMovimientos] = useState<MovimientoPreviewDTO[]>([]);
  const [seleccion, setSeleccion] = useState<Record<string, boolean>>({});
  const [resultado, setResultado] = useState<{
    creados: number;
    matched: number;
    unmatched: number;
    duplicados: number;
    errores: number;
  } | null>(null);

  const resumen = useMemo(() => {
    const importables = movimientos.filter((m) => !m.esEgreso && !m.yaImportado);
    const seleccionados = importables.filter((m) => seleccion[m.externalId]);
    return { importables: importables.length, seleccionados: seleccionados.length };
  }, [movimientos, seleccion]);

  const procesar = useCallback(
    async (archivo: File | undefined) => {
      if (!archivo) return;
      setEstado("leyendo");
      setError(null);
      try {
        const formData = new FormData();
        formData.set("file", archivo);
        const resultado = await previsualizarExtractoPDF(formData);
        if (!resultado.ok || !resultado.movimientos) {
          setEstado("idle");
          setError(resultado.error ?? "No se pudo leer el archivo.");
          return;
        }
        setFileName(resultado.fileName ?? archivo.name);
        setBankName(resultado.bankName ?? null);
        setUsedAI(resultado.usedAI ?? false);
        setMovimientos(resultado.movimientos);
        setSeleccion(
          Object.fromEntries(
            resultado.movimientos.filter((m) => !m.esEgreso && !m.yaImportado).map((m) => [m.externalId, true])
          )
        );
        setEstado("preview");
      } catch (e) {
        setEstado("idle");
        setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
      }
    },
    []
  );

  async function confirmar() {
    setConfirmando(true);
    const seleccionados = movimientos.filter((m) => seleccion[m.externalId]);
    const resultado = await confirmarExtractoPDF(
      fileName,
      seleccionados.map((m) => ({
        fecha: m.fecha,
        amount: m.amount,
        concept: m.concept,
        payerIdentifier: m.payerIdentifier,
        externalId: m.externalId,
        lineaOriginal: m.lineaOriginal,
      })),
      bankName
    );
    setResultado({
      creados: resultado.creados,
      matched: resultado.matched,
      unmatched: resultado.unmatched,
      duplicados: resultado.duplicados,
      errores: resultado.errores.length,
    });
    setConfirmando(false);
    setEstado("hecho");
    showToast(
      "Extracto importado",
      `${resultado.creados} movimientos cargados (${resultado.matched} conciliados automáticamente)`
    );
    router.refresh();
  }

  function reiniciar() {
    setEstado("idle");
    setError(null);
    setFileName("");
    setBankName(null);
    setUsedAI(false);
    setMovimientos([]);
    setSeleccion({});
    setResultado(null);
  }

  if (estado === "hecho" && resultado) {
    return (
      <Card className="animate-fade-in-up">
        <CardHeader title="Ingesta de extracto bancario (PDF)" subtitle={fileName} />
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <Check size={22} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {resultado.creados} movimientos importados
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
              {resultado.matched} conciliados automáticamente · {resultado.unmatched} sin vincular (revisalos con
              Sugerencias Inteligentes en la pestaña Webhooks)
              {resultado.duplicados > 0 ? ` · ${resultado.duplicados} ya estaban importados` : ""}
              {resultado.errores > 0 ? ` · ${resultado.errores} con error` : ""}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={reiniciar}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Importar otro extracto
            </button>
            {resultado.unmatched > 0 || resultado.matched > 0 ? (
              <button
                onClick={() => onVerWebhooks?.()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Ver en Webhooks
              </button>
            ) : null}
          </div>
        </div>
      </Card>
    );
  }

  if (estado === "preview") {
    return (
      <Card className="animate-fade-in-up">
        <CardHeader
          title="Movimientos detectados"
          subtitle={`${fileName}${bankName ? ` · ${bankName}` : ""} · elegí cuáles importar como cobros`}
          action={
            usedAI ? (
              <Badge tone="blue" icon={<Sparkles size={12} />}>
                Procesado con IA
              </Badge>
            ) : (
              <Badge tone="slate">Parser local</Badge>
            )
          }
        />
        <div className="space-y-3 p-4">
          {movimientos.map((m) => {
            const deshabilitado = m.esEgreso || m.yaImportado;
            return (
              <div
                key={m.externalId}
                className={`flex items-start gap-3 rounded-xl border p-3.5 ${
                  deshabilitado
                    ? "border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-900"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!seleccion[m.externalId]}
                  disabled={deshabilitado}
                  onChange={(e) =>
                    setSeleccion((prev) => ({ ...prev, [m.externalId]: e.target.checked }))
                  }
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {formatFecha(m.fecha)} · {formatMonto(m.amount)}
                    </p>
                    {m.esEgreso ? (
                      <Badge tone="slate" icon={<Ban size={12} />}>
                        Egreso — no se importa
                      </Badge>
                    ) : m.yaImportado ? (
                      <Badge tone="slate">Ya importado</Badge>
                    ) : m.organizationPropuesta ? (
                      <Badge tone="green" icon={<CircleCheck size={12} />}>
                        {m.organizationPropuesta.name}
                      </Badge>
                    ) : (
                      <Badge tone="amber" icon={<CircleHelp size={12} />}>
                        Sin vincular
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{m.concept}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
          <button
            onClick={reiniciar}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={resumen.seleccionados === 0 || confirmando}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirmando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Importar {resumen.seleccionados} movimiento{resumen.seleccionados === 1 ? "" : "s"}
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in-up">
      <CardHeader
        title="Ingesta de extracto bancario (parser universal con IA)"
        subtitle="PDF, imagen (PNG/JPG) o CSV de cualquier banco o billetera — detectamos los movimientos automáticamente"
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
            accept=".pdf,application/pdf,.png,image/png,.jpg,.jpeg,image/jpeg,.csv,text/csv"
            className="hidden"
            onChange={(e) => procesar(e.target.files?.[0])}
          />

          {estado === "leyendo" ? (
            <>
              <Loader2 size={26} className="animate-spin text-blue-600 dark:text-blue-400" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Leyendo el extracto…
              </p>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                <UploadCloud size={22} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Arrastrá tu extracto acá o hacé clic para elegir un archivo
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  PDF (hasta 8MB), PNG/JPG (hasta 5MB) o CSV (hasta 8MB)
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
          <FileText size={14} className="mt-0.5 shrink-0" />
          <span>
            Los movimientos con CUIT/CBU reconocible se concilian solos; el resto queda &quot;Sin
            vincular&quot; y podés resolverlos con Sugerencias Inteligentes desde la pestaña Webhooks.
          </span>
        </div>
      </div>
    </Card>
  );
}
