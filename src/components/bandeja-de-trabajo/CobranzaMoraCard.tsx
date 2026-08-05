"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { ejecutarReclamadorAutomatico, type ListaMorosidadResultado } from "@/app/morosidad/actions";
import { formatMonto } from "@/lib/format";
import { MessageCircle, Loader2, Clock, Wallet, DatabaseZap, CircleCheck, ArrowRight } from "lucide-react";

/**
 * Pregunta 3 de la Bandeja de Trabajo — "¿Qué puedo ejecutar ahora?": un
 * solo número (saldo total moroso estimado) y un solo botón primario, sin
 * tabla por organización (esa vista detallada sigue viva en /morosidad). El
 * botón llama directo a `ejecutarReclamadorAutomatico` (after() +
 * Promise.allSettled ya resuelto ahí, no se duplica).
 */
export function CobranzaMoraCard({ datosIniciales }: { datosIniciales: ListaMorosidadResultado }) {
  const { showToast } = useToast();
  const [enviando, setEnviando] = useState(false);
  const [enEspera, setEnEspera] = useState(false);

  if (!datosIniciales.ok) {
    return (
      <Card className="animate-fade-in-up">
        <CardHeader title="Cobranza de mora" subtitle="Organizaciones con saldos vencidos" />
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

  const { organizaciones } = datosIniciales;
  const total = organizaciones.reduce((sum, o) => sum + (o.montoEstimado ?? 0), 0);
  const notificables = organizaciones.filter((o) => o.puedeNotificar).length;

  async function reclamar() {
    setEnviando(true);
    const r = await ejecutarReclamadorAutomatico();
    setEnviando(false);
    setEnEspera(true);
    showToast(
      "Reclamador Automático en marcha",
      `${r.encolados} recordatorio(s) en camino por WhatsApp` +
        (r.omitidosPorCooldown > 0 ? ` · ${r.omitidosPorCooldown} ya notificados recientemente` : "")
    );
  }

  return (
    <Card className="animate-fade-in-up">
      <CardHeader
        title="Cobranza de mora"
        subtitle="Organizaciones con saldos vencidos"
        action={
          organizaciones.length > 0 ? (
            <Link
              href="/morosidad"
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Ver detalle <ArrowRight size={12} />
            </Link>
          ) : null
        }
      />
      <div className="flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <p className="flex items-center justify-center gap-1 text-xs text-slate-500 dark:text-slate-400 sm:justify-start">
            <Wallet size={13} /> Saldo total moroso estimado
          </p>
          <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-slate-100">
            {formatMonto(total, "ARS")}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {organizaciones.length} organización{organizaciones.length === 1 ? "" : "es"} en mora
          </p>
        </div>

        <div className="flex flex-col items-center gap-2">
          {organizaciones.length === 0 ? (
            <Badge tone="green" icon={<CircleCheck size={12} />}>
              Sin morosidad
            </Badge>
          ) : enEspera ? (
            <Badge tone="amber" icon={<Clock size={12} />}>
              En Espera
            </Badge>
          ) : notificables === 0 ? (
            <Badge tone="slate" icon={<Clock size={12} />}>
              Notificados recientemente
            </Badge>
          ) : null}
          <Button
            size="lg"
            onClick={reclamar}
            disabled={enviando || notificables === 0}
            title={notificables === 0 && !enEspera ? "Ya se notificó a todos hace poco (cooldown de 3 días)" : undefined}
            className="w-full sm:w-auto"
          >
            {enviando ? <Loader2 className="animate-spin" /> : <MessageCircle size={16} />}
            Reclamar Mora por WhatsApp
          </Button>
        </div>
      </div>
    </Card>
  );
}
