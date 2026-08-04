import { Card, CardHeader } from "@/components/ui/Card";

export function ConciliacionDonut({
  porcentajeAuto,
  porcentajeRevision,
}: {
  porcentajeAuto: number;
  porcentajeRevision: number;
}) {
  const porcentajeSinMatch = Math.max(
    0,
    100 - porcentajeAuto - porcentajeRevision
  );

  const gradient = `conic-gradient(
    #2563eb 0% ${porcentajeAuto}%,
    #f59e0b ${porcentajeAuto}% ${porcentajeAuto + porcentajeRevision}%,
    #e2e8f0 ${porcentajeAuto + porcentajeRevision}% 100%
  )`;

  return (
    <Card>
      <CardHeader
        title="Aprobación en 1 clic (mes)"
        subtitle="La IA deja el match listo — vos revisás y aprobás el pago"
      />
      <div className="flex items-center gap-6 px-5 py-6">
        <div
          className="relative h-32 w-32 shrink-0 rounded-full"
          style={{ backgroundImage: gradient }}
        >
          <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-white dark:bg-slate-900">
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {porcentajeAuto}%
            </span>
            <span className="text-[10px] text-slate-400">listo p/ aprobar</span>
          </div>
        </div>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
            <span className="text-slate-600 dark:text-slate-300">
              Listo para aprobar — {porcentajeAuto}%
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span className="text-slate-600 dark:text-slate-300">
              Requiere revisión — {porcentajeRevision}%
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
            <span className="text-slate-600 dark:text-slate-300">
              Sin match — {porcentajeSinMatch}%
            </span>
          </li>
        </ul>
      </div>
    </Card>
  );
}
