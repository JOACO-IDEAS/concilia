"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { formatDate, formatMonto } from "@/lib/format";
import {
  enviarRecordatorioIndividual,
  ejecutarReclamadorAutomatico,
  type ListaMorosidadResultado,
  type OrganizacionMorosaDTO,
} from "@/app/morosidad/actions";
import {
  DatabaseZap,
  CircleCheck,
  Clock,
  Loader2,
  MessageCircle,
  Send,
  ShieldAlert,
  Wallet,
} from "lucide-react";

function formatMontoEstimado(monto: number | null, currency: string): string {
  return monto === null ? "Sin base para estimar" : formatMonto(monto, currency);
}

export function OverdueOrganizationsPanel({ datosIniciales }: { datosIniciales: ListaMorosidadResultado }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [organizaciones, setOrganizaciones] = useState<OrganizacionMorosaDTO[]>(datosIniciales.organizaciones);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [ejecutandoLote, setEjecutandoLote] = useState(false);

  const resumen = useMemo(() => {
    const montoTotal = organizaciones.reduce((sum, o) => sum + (o.montoEstimado ?? 0), 0);
    const atrasoPromedio = organizaciones.length
      ? Math.round(organizaciones.reduce((sum, o) => sum + o.diasAtraso, 0) / organizaciones.length)
      : 0;
    const notificables = organizaciones.filter((o) => o.puedeNotificar).length;
    return { montoTotal, atrasoPromedio, notificables };
  }, [organizaciones]);

  async function enviarIndividual(org: OrganizacionMorosaDTO) {
    setEnviando(org.organizationId);
    const resultado = await enviarRecordatorioIndividual(org.organizationId);
    setEnviando(null);
    if (resultado.ok && !resultado.omitido) {
      showToast("Recordatorio enviado por WhatsApp", `${org.organizationName} · CBU/Alias adjuntado`);
      setOrganizaciones((prev) =>
        prev.map((o) =>
          o.organizationId === org.organizationId
            ? { ...o, ultimoRecordatorioEnviado: new Date().toISOString(), puedeNotificar: false }
            : o
        )
      );
      router.refresh();
    } else if (resultado.omitido) {
      showToast("No se envió", resultado.motivo);
    } else {
      showToast("No se pudo enviar el recordatorio", resultado.motivo);
    }
  }

  async function ejecutarLote() {
    setEjecutandoLote(true);
    const resultado = await ejecutarReclamadorAutomatico();
    setEjecutandoLote(false);
    showToast(
      "Reclamador Automático en marcha",
      `${resultado.encolados} recordatorio(s) encolados en segundo plano` +
        (resultado.omitidosPorCooldown > 0
          ? ` · ${resultado.omitidosPorCooldown} omitidos (ya notificados recientemente)`
          : "")
    );
    router.refresh();
  }

  if (!datosIniciales.ok) {
    return (
      <Card className="animate-fade-in-up">
        <CardHeader
          title="Cobranza Automática (IA)"
          subtitle="Detección de morosidad y reclamos por WhatsApp sobre datos reales"
        />
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
    <div className="space-y-4">
      <Card className="animate-fade-in-up">
        <CardHeader
          title="Cobranza Automática (IA)"
          subtitle="Organizaciones con saldos vencidos, calculado sobre el historial real de pagos"
          action={
            <button
              onClick={ejecutarLote}
              disabled={ejecutandoLote || resumen.notificables === 0}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ejecutandoLote ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Ejecutar Reclamador Automático
            </button>
          }
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <Badge tone="red" icon={<ShieldAlert size={12} />}>
            {organizaciones.length} en mora
          </Badge>
          <Badge tone="amber" icon={<Wallet size={12} />}>
            {formatMonto(resumen.montoTotal, "ARS")} estimado
          </Badge>
          <Badge tone="blue" icon={<Clock size={12} />}>
            {resumen.atrasoPromedio} días de atraso promedio
          </Badge>
          <Badge tone="slate">{resumen.notificables} listas para notificar</Badge>
        </div>

        {organizaciones.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <CircleCheck size={22} />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Ninguna organización en mora
            </p>
          </div>
        ) : (
          <>
            {/* Mobile: tarjetas */}
            <div className="space-y-3 p-4 sm:hidden">
              {organizaciones.map((org) => (
                <OrganizacionMorosaCard
                  key={org.organizationId}
                  org={org}
                  enviando={enviando === org.organizationId}
                  onEnviar={() => enviarIndividual(org)}
                />
              ))}
            </div>

            {/* Desktop: tabla */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-5 py-3 font-medium">Organización</th>
                    <th className="px-5 py-3 font-medium">Último pago</th>
                    <th className="px-5 py-3 font-medium">Días de atraso</th>
                    <th className="px-5 py-3 font-medium">Monto estimado</th>
                    <th className="px-5 py-3 font-medium text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {organizaciones.map((org) => (
                    <tr key={org.organizationId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{org.organizationName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">CUIT {org.taxId}</p>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">
                        {org.fechaUltimoPago ? formatDate(org.fechaUltimoPago) : "Nunca pagó"}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={org.diasAtraso >= 30 ? "red" : "amber"}>{org.diasAtraso} días</Badge>
                      </td>
                      <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-200">
                        {formatMontoEstimado(org.montoEstimado, org.currency)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => enviarIndividual(org)}
                          disabled={enviando !== null || !org.puedeNotificar}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          title={
                            org.puedeNotificar
                              ? undefined
                              : `Ya se notificó el ${org.ultimoRecordatorioEnviado ? formatDate(org.ultimoRecordatorioEnviado) : ""}`
                          }
                        >
                          {enviando === org.organizationId ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <MessageCircle size={12} />
                          )}
                          {org.puedeNotificar ? "Enviar Recordatorio por WhatsApp" : "Notificado recientemente"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function OrganizacionMorosaCard({
  org,
  enviando,
  onEnviar,
}: {
  org: OrganizacionMorosaDTO;
  enviando: boolean;
  onEnviar: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {org.organizationName}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">CUIT {org.taxId}</p>
        </div>
        <Badge tone={org.diasAtraso >= 30 ? "red" : "amber"}>{org.diasAtraso} días</Badge>
      </div>

      <div className="mt-2 border-t border-slate-100 pt-2 text-sm dark:border-slate-800">
        <p className="font-medium text-slate-800 dark:text-slate-200">
          {formatMontoEstimado(org.montoEstimado, org.currency)}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Último pago: {org.fechaUltimoPago ? formatDate(org.fechaUltimoPago) : "nunca"}
        </p>
      </div>

      <button
        onClick={onEnviar}
        disabled={enviando || !org.puedeNotificar}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {enviando ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
        {org.puedeNotificar ? "Enviar Recordatorio por WhatsApp" : "Notificado recientemente"}
      </button>
    </div>
  );
}
