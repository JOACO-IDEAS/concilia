"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, ScanText, Fingerprint, BrainCircuit } from "lucide-react";

type Status = "idle" | "processing" | "done";

const SIMULATED_FILES = [
  { nombre: "extracto_banco_galicia_agosto2026.csv", banco: "Banco Galicia" },
  { nombre: "extracto_mercadopago_agosto2026.xlsx", banco: "Mercado Pago" },
  { nombre: "movimientos_bbva_01-08.pdf", banco: "BBVA" },
];

const STAGES = [
  {
    icon: ScanText,
    title: "Leyendo PDF/Excel…",
    subtitle: "Extrayendo texto y filas del extracto bancario",
    duration: 900,
  },
  {
    icon: Fingerprint,
    title: "Identificando CUITs y referencias…",
    subtitle: "Detectando CBUs, CVUs y nombres de titulares en cada movimiento",
    duration: 1000,
  },
  {
    icon: BrainCircuit,
    title: "Aplicando motor de IA…",
    subtitle: "Vinculando cada transferencia con su Unidad Funcional",
    duration: 900,
  },
];

const TOTAL_DURATION = STAGES.reduce((sum, s) => sum + s.duration, 0);

export function UploadDropzone({ onProcessed }: { onProcessed: () => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ nombre: string; banco: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runSimulation = useCallback(() => {
    const file = SIMULATED_FILES[Math.floor(Math.random() * SIMULATED_FILES.length)];
    setFileInfo(file);
    setStatus("processing");
    setStageIndex(0);
    setProgress(0);

    let elapsed = 0;
    STAGES.forEach((stage, i) => {
      window.setTimeout(() => setStageIndex(i), elapsed);
      elapsed += stage.duration;
    });

    const progressStep = 40;
    const progressTicks = Math.ceil(TOTAL_DURATION / progressStep);
    for (let tick = 1; tick <= progressTicks; tick++) {
      window.setTimeout(() => {
        setProgress(Math.min(100, Math.round((tick / progressTicks) * 100)));
      }, tick * progressStep);
    }

    window.setTimeout(() => {
      setStatus("done");
      onProcessed();
    }, TOTAL_DURATION + 250);
  }, [onProcessed]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (status === "idle") runSimulation();
    },
    [status, runSimulation]
  );

  if (status === "done") {
    return (
      <div className="flex animate-fade-in-up items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
        <FileSpreadsheet size={20} />
        <div className="flex-1">
          <p className="font-medium">{fileInfo?.nombre}</p>
          <p className="text-xs opacity-80">
            Procesado con IA · {fileInfo?.banco} · 12 transacciones detectadas
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setFileInfo(null);
          }}
          className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium hover:bg-emerald-100 dark:border-emerald-500/40 dark:hover:bg-emerald-500/20"
        >
          Subir otro extracto
        </button>
      </div>
    );
  }

  const currentStage = STAGES[stageIndex];

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (status === "idle") setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => status === "idle" && inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
        status === "idle" ? "cursor-pointer" : "cursor-default"
      } ${
        isDragging
          ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10"
          : "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.pdf"
        className="hidden"
        onChange={() => status === "idle" && runSimulation()}
      />

      {status === "idle" && (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <UploadCloud size={22} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Arrastrá el extracto bancario acá o hacé clic para simular una carga
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Formatos soportados: CSV, XLSX, PDF · Banco Galicia, Santander, BBVA, Banco Nación, Banco Macro, Mercado Pago, Ualá
            </p>
          </div>
        </>
      )}

      {status === "processing" && (
        <div key={stageIndex} className="flex w-full max-w-sm animate-fade-in-up flex-col items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <currentStage.icon size={22} className="animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {currentStage.title}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {currentStage.subtitle}
            </p>
          </div>

          <div className="mt-1 w-full">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-blue-600 transition-[width] duration-150 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
              <span>{fileInfo?.nombre}</span>
              <span>{progress}%</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {STAGES.map((stage, i) => (
              <span
                key={stage.title}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i <= stageIndex ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
