"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { formatARS } from "@/lib/format";
import type { PuntoTendencia } from "@/app/dashboard/metrics-actions";

function formatARSCompacto(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDiaCorto(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" }).format(new Date(`${iso}T00:00:00`));
}

function TooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="font-medium text-slate-500 dark:text-slate-400">{formatDiaCorto(label)}</p>
      <p className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
        {formatARS(payload[0].value)}
      </p>
    </div>
  );
}

export function TrendChart({ datos }: { datos: PuntoTendencia[] }) {
  const hayDatos = datos.some((d) => d.total > 0);

  return (
    <Card className="animate-fade-in-up">
      <CardHeader
        title="Tendencia de cobros del mes"
        subtitle="Evolución diaria de pagos conciliados (webhook + vínculo manual)"
      />
      <div className="px-2 py-4 sm:px-4">
        {hayDatos ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={datos} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCobros" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-100 dark:text-slate-800" vertical={false} />
              <XAxis
                dataKey="fecha"
                tickFormatter={formatDiaCorto}
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-slate-400"
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatARSCompacto}
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-slate-400"
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip content={<TooltipContent />} />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#2563eb"
                strokeWidth={2}
                fill="url(#colorCobros)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Todavía no hay cobros conciliados este mes
            </p>
            <p className="text-xs text-slate-400">
              La curva va a aparecer apenas se concilie el primer pago del mes.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
