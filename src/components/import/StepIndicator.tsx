import { Check } from "lucide-react";

const PASOS = [
  { numero: 1, etiqueta: "Subir archivo" },
  { numero: 2, etiqueta: "Mapear columnas" },
  { numero: 3, etiqueta: "Revisar y validar" },
  { numero: 4, etiqueta: "Confirmar" },
] as const;

export function StepIndicator({ pasoActual }: { pasoActual: number }) {
  const actual = PASOS.find((p) => p.numero === pasoActual);

  return (
    <div className="animate-fade-in-up">
      {/* Mobile: texto + barra de progreso */}
      <div className="sm:hidden">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Paso {pasoActual} de {PASOS.length} — {actual?.etiqueta}
        </p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-blue-600 transition-[width]"
            style={{ width: `${(pasoActual / PASOS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Desktop: stepper con círculos */}
      <ol className="hidden items-center sm:flex">
        {PASOS.map((paso, i) => {
          const completado = paso.numero < pasoActual;
          const activo = paso.numero === pasoActual;
          return (
            <li key={paso.numero} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    completado
                      ? "bg-blue-600 text-white"
                      : activo
                        ? "border-2 border-blue-600 text-blue-600 dark:text-blue-400"
                        : "border-2 border-slate-200 text-slate-400 dark:border-slate-700"
                  }`}
                >
                  {completado ? <Check size={14} /> : paso.numero}
                </div>
                <span
                  className={`text-sm font-medium ${
                    activo
                      ? "text-slate-900 dark:text-slate-100"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {paso.etiqueta}
                </span>
              </div>
              {i < PASOS.length - 1 ? (
                <div
                  className={`mx-3 h-0.5 flex-1 rounded-full transition-colors ${
                    completado ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-800"
                  }`}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
