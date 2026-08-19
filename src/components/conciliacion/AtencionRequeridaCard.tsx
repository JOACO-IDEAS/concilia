"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { CaseMetadata } from "@/components/inbox/CaseMetadata";
import { vincularPagoManualmente } from "@/app/conciliacion/payments-actions";
import type {
  BandejaInconsistenciasResultado,
  InconsistenciaDTO,
} from "@/app/conciliacion/payments-actions";
import { formatMonto } from "@/lib/format";
import { Sparkles, MessageCircleCheck, Loader2, ArrowRight, Link2, DatabaseZap, CheckCircle2 } from "lucide-react";

function toneConfianza(confidence: number): "green" | "amber" | "slate" {
  if (confidence >= 70) return "green";
  if (confidence >= 40) return "amber";
  return "slate";
}

/**
 * "Requiere tu atención" — cola de excepciones: un pago `UNMATCHED` por
 * fila, con la sugerencia de Smart Match y una sola acción. Única fuente de
 * verdad, reutilizada tal cual por `/conciliacion` y por Inicio.
 *
 * TASK UX 5.0 — antes este componente sólo mostraba un contenedor propio en
 * el estado de error y devolvía `null` sin ningún aviso cuando no había
 * casos; ahora siempre vive dentro de la misma Card con conteo real en el
 * título (nunca "0" inventado — es `items.length`) y un estado "todo al
 * día" explícito, consistente con el resto de la app.
 *
 * `organizaciones` es opcional: si se pasa (uso en `/conciliacion`), el caso
 * "sin sugerencia" muestra un selector inline para vincular a mano ahí
 * mismo. Si no se pasa (uso en la Bandeja de Trabajo), ese caso linkea a
 * `/conciliacion` para resolverlo con más contexto.
 */
export function AtencionRequeridaCard({
  datosIniciales,
  organizaciones,
}: {
  datosIniciales: BandejaInconsistenciasResultado;
  organizaciones?: { id: string; name: string }[];
}) {
  const { showToast } = useToast();
  const router = useRouter();
  const [items, setItems] = useState<InconsistenciaDTO[]>(datosIniciales.items);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Record<string, string>>({});

  async function aprobar(paymentTransactionId: string, organizationId: string, organizationName: string) {
    setProcesando(paymentTransactionId);
    const r = await vincularPagoManualmente(paymentTransactionId, organizationId);
    setProcesando(null);
    if (r.ok) {
      showToast("Aprobado y notificado", `${organizationName} · Notificación enviada por WhatsApp`);
      setItems((prev) => prev.filter((i) => i.id !== paymentTransactionId));
      router.refresh();
    } else {
      showToast("No se pudo aprobar", r.error);
    }
  }

  if (!datosIniciales.ok) {
    return (
      <Card className="animate-fade-in-up">
        <CardHeader title="Requiere tu atención" subtitle="Pagos que la IA no pudo conciliar sola" />
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
        title="Requiere tu atención"
        subtitle="Pagos que la IA no pudo conciliar sola — administrá por excepción."
        action={items.length > 0 ? <Badge tone="amber">{items.length} {items.length === 1 ? "caso" : "casos"}</Badge> : undefined}
      />
      {items.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-slate-600 dark:text-slate-300">
          <CheckCircle2 size={20} className="shrink-0 text-emerald-600" />
          Todo al día. No hay pagos esperando tu aprobación.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col items-start justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {formatMonto(item.amount, item.currency)}
                </p>
                <CaseMetadata
                  items={[
                    { text: item.concept ?? item.payerIdentifier ?? "Sin datos del pagador" },
                  ]}
                />
                {item.sugerencia ? (
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <Sparkles size={11} className="shrink-0 text-blue-500" />
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
                  onClick={() => aprobar(item.id, item.sugerencia!.organizationId, item.sugerencia!.organizationName)}
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
              ) : organizaciones ? (
                <div className="flex w-full shrink-0 items-center gap-1.5 sm:w-auto">
                  <select
                    value={seleccion[item.id] ?? ""}
                    onChange={(e) => setSeleccion((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 sm:flex-none"
                  >
                    <option value="">Elegir organización…</option>
                    {organizaciones.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!seleccion[item.id] || procesando !== null}
                    onClick={() => {
                      const org = organizaciones.find((o) => o.id === seleccion[item.id]);
                      if (org) aprobar(item.id, org.id, org.name);
                    }}
                  >
                    {procesando === item.id ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                    Vincular
                  </Button>
                </div>
              ) : (
                <Link
                  href="/conciliacion"
                  className="flex shrink-0 items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Revisar en Conciliación <ArrowRight size={12} />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
