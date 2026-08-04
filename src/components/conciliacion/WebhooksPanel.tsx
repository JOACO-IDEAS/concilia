"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format";
import {
  vincularPagoManualmente,
  type ListaPagosResultado,
  type PagoWebhookDTO,
} from "@/app/conciliacion/payments-actions";
import { SmartMatchModal } from "@/components/conciliacion/SmartMatchModal";
import {
  DatabaseZap,
  Inbox,
  CircleCheck,
  CircleHelp,
  Clock,
  Link2,
  Loader2,
  Sparkles,
  Webhook,
} from "lucide-react";

const ENDPOINT = "/api/v1/webhooks/payments";

const estadoBadge = {
  MATCHED: { tone: "green" as const, label: "Conciliado", icon: <CircleCheck size={12} /> },
  UNMATCHED: { tone: "red" as const, label: "Sin vincular", icon: <CircleHelp size={12} /> },
  PENDING: { tone: "amber" as const, label: "Pendiente", icon: <Clock size={12} /> },
};

function formatMonto(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("es-AR")}`;
  }
}

export function WebhooksPanel({ datosIniciales }: { datosIniciales: ListaPagosResultado }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pagos, setPagos] = useState<PagoWebhookDTO[]>(datosIniciales.pagos);
  const [seleccion, setSeleccion] = useState<Record<string, string>>({});
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [smartMatchPago, setSmartMatchPago] = useState<PagoWebhookDTO | null>(null);

  const resumen = useMemo(() => {
    return {
      total: pagos.length,
      matched: pagos.filter((p) => p.status === "MATCHED").length,
      unmatched: pagos.filter((p) => p.status === "UNMATCHED").length,
      pending: pagos.filter((p) => p.status === "PENDING").length,
    };
  }, [pagos]);

  async function vincular(pago: PagoWebhookDTO) {
    const organizationId = seleccion[pago.id];
    if (!organizationId) return;
    setVinculando(pago.id);
    const resultado = await vincularPagoManualmente(pago.id, organizationId);
    setVinculando(null);
    if (resultado.ok) {
      const org = datosIniciales.organizaciones.find((o) => o.id === organizationId);
      setPagos((prev) =>
        prev.map((p) =>
          p.id === pago.id
            ? {
                ...p,
                status: "MATCHED",
                matchedAt: new Date().toISOString(),
                organization: org ? { id: org.id, name: org.name } : p.organization,
              }
            : p
        )
      );
      showToast(
        "Pago vinculado",
        org ? `Asociado a ${org.name} · Notificación enviada por Email y WhatsApp` : undefined
      );
      router.refresh();
    } else {
      showToast("No se pudo vincular el pago", resultado.error);
    }
  }

  function marcarAprobadoPorSmartMatch(
    pagoId: string,
    organizationId: string,
    organizationName: string
  ) {
    setPagos((prev) =>
      prev.map((p) =>
        p.id === pagoId
          ? {
              ...p,
              status: "MATCHED",
              matchedAt: new Date().toISOString(),
              organization: { id: organizationId, name: organizationName },
            }
          : p
      )
    );
    setSmartMatchPago(null);
    router.refresh();
  }

  if (!datosIniciales.ok) {
    return (
      <Card className="animate-fade-in-up">
        <CardHeader
          title="Webhooks de pagos"
          subtitle="Notificaciones de cobro recibidas de proveedores de Open Banking"
        />
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <DatabaseZap size={22} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Todavía no hay una base de datos conectada
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
              Este panel va a mostrar los pagos apenas se conecte una Postgres real. El endpoint
              del webhook ya está listo para recibir eventos.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="animate-fade-in-up">
        <CardHeader
          title="Webhooks de pagos"
          subtitle="Notificaciones de cobro recibidas de Open Banking / pasarelas de pago"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div className="flex flex-wrap gap-2">
            <Badge tone="slate">{resumen.total} recibidos</Badge>
            <Badge tone="green" icon={<CircleCheck size={12} />}>
              {resumen.matched} conciliados
            </Badge>
            {resumen.unmatched > 0 ? (
              <Badge tone="red" icon={<CircleHelp size={12} />}>
                {resumen.unmatched} sin vincular
              </Badge>
            ) : null}
            {resumen.pending > 0 ? (
              <Badge tone="amber" icon={<Clock size={12} />}>
                {resumen.pending} pendientes
              </Badge>
            ) : null}
          </div>
          <code className="hidden rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-500 sm:block dark:bg-slate-800 dark:text-slate-400">
            POST {ENDPOINT}
          </code>
        </div>

        {pagos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
              <Inbox size={22} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Todavía no llegó ningún pago por webhook
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                Cuando tu proveedor de Open Banking (Belvo, Prometeo, Pluggy, etc.) envíe una
                notificación a <code className="text-slate-600 dark:text-slate-300">{ENDPOINT}</code>,
                va a aparecer acá automáticamente.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile: tarjetas */}
            <div className="space-y-3 p-4 sm:hidden">
              {pagos.map((pago) => (
                <PagoCardMobile
                  key={pago.id}
                  pago={pago}
                  organizaciones={datosIniciales.organizaciones}
                  seleccionado={seleccion[pago.id] ?? ""}
                  vinculando={vinculando === pago.id}
                  onSeleccionar={(id) => setSeleccion((prev) => ({ ...prev, [pago.id]: id }))}
                  onVincular={() => vincular(pago)}
                  onSugerencias={() => setSmartMatchPago(pago)}
                />
              ))}
            </div>

            {/* Desktop: tabla */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-5 py-3 font-medium">Fecha</th>
                    <th className="px-5 py-3 font-medium">Proveedor</th>
                    <th className="px-5 py-3 font-medium">Monto</th>
                    <th className="px-5 py-3 font-medium">Pagador / Concepto</th>
                    <th className="px-5 py-3 font-medium">Estado</th>
                    <th className="px-5 py-3 font-medium text-right">Organización</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pagos.map((pago) => {
                    const badge = estadoBadge[pago.status];
                    const pendienteDeVinculo = pago.status !== "MATCHED";
                    return (
                      <tr key={pago.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">
                          {formatDateTime(pago.createdAt)}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200">
                            <Webhook size={12} className="text-slate-400" />
                            {pago.provider}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-slate-100">
                          {formatMonto(pago.amount, pago.currency)}
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-slate-700 dark:text-slate-200">
                            {pago.payerIdentifier ?? "Sin identificar"}
                          </p>
                          {pago.concept ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400">{pago.concept}</p>
                          ) : null}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge tone={badge.tone} icon={badge.icon}>
                            {badge.label}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {pago.organization ? (
                            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                              {pago.organization.name}
                            </span>
                          ) : pendienteDeVinculo ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {pago.status === "UNMATCHED" ? (
                                <button
                                  onClick={() => setSmartMatchPago(pago)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20"
                                >
                                  <Sparkles size={12} />
                                  Sugerencias
                                </button>
                              ) : null}
                              <select
                                value={seleccion[pago.id] ?? ""}
                                onChange={(e) =>
                                  setSeleccion((prev) => ({ ...prev, [pago.id]: e.target.value }))
                                }
                                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
                              >
                                <option value="">Elegir organización…</option>
                                {datosIniciales.organizaciones.map((org) => (
                                  <option key={org.id} value={org.id}>
                                    {org.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => vincular(pago)}
                                disabled={!seleccion[pago.id] || vinculando === pago.id}
                                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {vinculando === pago.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Link2 size={12} />
                                )}
                                Vincular
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {smartMatchPago ? (
        <SmartMatchModal
          key={smartMatchPago.id}
          pago={smartMatchPago}
          onClose={() => setSmartMatchPago(null)}
          onAprobado={(organizationId, organizationName) =>
            marcarAprobadoPorSmartMatch(smartMatchPago.id, organizationId, organizationName)
          }
        />
      ) : null}
    </div>
  );
}

function PagoCardMobile({
  pago,
  organizaciones,
  seleccionado,
  vinculando,
  onSeleccionar,
  onVincular,
  onSugerencias,
}: {
  pago: PagoWebhookDTO;
  organizaciones: { id: string; name: string }[];
  seleccionado: string;
  vinculando: boolean;
  onSeleccionar: (id: string) => void;
  onVincular: () => void;
  onSugerencias: () => void;
}) {
  const badge = estadoBadge[pago.status];

  return (
    <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Webhook size={11} /> {pago.provider} · {formatDateTime(pago.createdAt)}
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
            {formatMonto(pago.amount, pago.currency)}
          </p>
        </div>
        <Badge tone={badge.tone} icon={badge.icon}>
          {badge.label}
        </Badge>
      </div>

      <div className="mt-2 border-t border-slate-100 pt-2 text-sm dark:border-slate-800">
        <p className="text-slate-700 dark:text-slate-200">
          {pago.payerIdentifier ?? "Pagador sin identificar"}
        </p>
        {pago.concept ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{pago.concept}</p>
        ) : null}
      </div>

      <div className="mt-3">
        {pago.organization ? (
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Vinculado a {pago.organization.name}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {pago.status === "UNMATCHED" ? (
              <button
                onClick={onSugerencias}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20"
              >
                <Sparkles size={13} />
                Ver Sugerencias Inteligentes
              </button>
            ) : null}
            <select
              value={seleccionado}
              onChange={(e) => onSeleccionar(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="">Elegir organización…</option>
              {organizaciones.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            <button
              onClick={onVincular}
              disabled={!seleccionado || vinculando}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {vinculando ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
              Vincular
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
