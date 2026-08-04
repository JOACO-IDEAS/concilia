import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatARS } from "@/lib/format";
import type { Consorcio } from "@/lib/types";
import { CircleCheck, TriangleAlert, CircleX } from "lucide-react";

const estadoConfig = {
  "al-dia": { label: "Al día", tone: "green" as const, icon: CircleCheck },
  "con-demoras": { label: "Con demoras", tone: "amber" as const, icon: TriangleAlert },
  critico: { label: "Crítico", tone: "red" as const, icon: CircleX },
};

export function ConsorciosOverview({ consorcios }: { consorcios: Consorcio[] }) {
  return (
    <Card>
      <CardHeader
        title="Estado general de edificios"
        subtitle="Recaudación de agosto 2026 vs. expensas facturadas"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <th className="px-5 py-3 font-medium">Consorcio</th>
              <th className="px-5 py-3 font-medium">Unidades</th>
              <th className="px-5 py-3 font-medium">Recaudado</th>
              <th className="px-5 py-3 font-medium">% Listo p/ aprobar</th>
              <th className="px-5 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {consorcios.map((c) => {
              const cfg = estadoConfig[c.estado];
              const Icon = cfg.icon;
              const pctRecaudado = Math.round(
                (c.recaudacionEfectiva / c.recaudacionEsperada) * 100
              );
              return (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {c.nombre}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{c.barrio}</p>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">
                    {c.unidades}
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {formatARS(c.recaudacionEfectiva)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {pctRecaudado}% de {formatARS(c.recaudacionEsperada)}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${c.porcentajeConciliadoAuto}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {c.porcentajeConciliadoAuto}%
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={cfg.tone} icon={<Icon size={12} />}>
                      {cfg.label}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
