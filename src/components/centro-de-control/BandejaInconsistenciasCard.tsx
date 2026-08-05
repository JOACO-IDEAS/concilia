"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { vincularPagoManualmente } from "@/app/conciliacion/payments-actions";
import type {
  BandejaInconsistenciasResultado,
  InconsistenciaDTO,
} from "@/app/centro-de-control/actions";
import { Sparkles, MessageCircleCheck, Loader2, ArrowRight, Inbox, DatabaseZap } from "lucide-react";

function formatMonto(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("es-AR")}`;
  }
}

function toneConfianza(confidence: number): "green" | "amber" | "slate" {
  if (confidence >= 70) return "green";
  if (confidence >= 40) return "amber";
  return "slate";
}

/**
 * "Bandeja de Entrada de IA (Inconsistencias)" del Centro de Control —
 * lista tipo card (no tabla) de pagos UNMATCHED con la mejor sugerencia de
 * Smart Match. Un solo botón por card: "Aprobar y Notificar" llama
 * directo a `vincularPagoManualmente` (dispara Email+WhatsApp vía
 * `notificarPagoMatched` dentro de esa misma acción) — sin modal, sin
 * elegir entre 3 opciones.
 */
export function BandejaInconsistenciasCard({
  datosIniciales,
}: {
  datosIniciales: BandejaInconsistenciasResultado;
}) {
  const { showToast } = useToast();
  const router = useRouter();
  const [items, setItems] = useState<InconsistenciaDTO[]>(datosIniciales.items);
  const [procesando, setProcesando] = useState<string | null>(null);

  async function aprobar(item: InconsistenciaDTO) {
    if (!item.sugerencia) return;
    setProcesando(item.id);
    const r = await vincularPagoManualmente(item.id, item.sugerencia.organizationId);
    setProcesando(null);
    if (r.ok) {
      showToast(
        "Aprobado y notificado",
        `${item.sugerencia.organizationName} · Notificación enviada por WhatsApp`
      );
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      router.refresh();
    } else {
      showToast("No se pudo aprobar", r.error);
    }
  }

  if (!datosIniciales.ok) {
    return (
      <Card className="animate-fade-in-up">
        <CardHeader title="Bandeja de Entrada de IA" subtitle="Pagos que la IA no pudo conciliar sola" />
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <DatabaseZap size={22} />
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Todavía no hay una base de datos conectada
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in-up">
      <CardHeader
        title="Bandeja de Entrada de IA"
        subtitle="Pagos que la IA no pudo conciliar sola"
        action={items.length > 0 ? <Badge tone="amber">{items.length}</Badge> : null}
      />
      <div className="space-y-3 p-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox size={28} className="text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Bandeja vacía — todo conciliado
            </p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col items-start justify-between gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center dark:border-slate-800"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {formatMonto(item.amount, item.currency)}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {item.concept ?? item.payerIdentifier ?? "Sin datos del pagador"}
                </p>
                {item.sugerencia ? (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                    <Sparkles size={11} className="text-blue-500" />
                    {item.sugerencia.organizationName}
                    <Badge tone={toneConfianza(item.sugerencia.confidence)}>
                      {item.sugerencia.confidence}% de confianza
                    </Badge>
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-slate-400">Sin sugerencia de la IA todavía</p>
                )}
              </div>

              {item.sugerencia ? (
                <Button
                  onClick={() => aprobar(item)}
                  disabled={procesando !== null}
                  className="w-full shrink-0 sm:w-auto"
                >
                  {procesando === item.id ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <MessageCircleCheck size={15} />
                  )}
                  Aprobar y Notificar
                </Button>
              ) : (
                <Link
                  href="/conciliacion"
                  className="flex shrink-0 items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Revisar en Webhooks <ArrowRight size={12} />
                </Link>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
