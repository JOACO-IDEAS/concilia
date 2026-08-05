import { Topbar } from "@/components/layout/Topbar";
import { Card, CardHeader } from "@/components/ui/Card";
import { obtenerConversacionesRecientes } from "./actions";
import { formatMonto } from "@/lib/format";
import { MessageCircle, DatabaseZap } from "lucide-react";

export const dynamic = "force-dynamic";

function formatFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

/**
 * "Conversaciones" — historial de recordatorios de cobranza enviados por
 * WhatsApp (`PaymentReminder`). No incluye todavía recibos/alertas de pago
 * (esos se logean pero no se persisten) — placeholder intencionalmente
 * acotado a lo que hoy es verificable, no un inbox completo simulado.
 */
export default async function ConversacionesPage() {
  const resultado = await obtenerConversacionesRecientes();

  return (
    <>
      <Topbar title="Conversaciones" subtitle="Recordatorios de cobranza enviados por WhatsApp" />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-3 p-4 sm:p-6">
        {!resultado.ok ? (
          <Card className="animate-fade-in-up">
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                <DatabaseZap size={22} />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Todavía no hay una base de datos conectada
              </p>
            </div>
          </Card>
        ) : resultado.recordatorios.length === 0 ? (
          <Card className="animate-fade-in-up">
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <MessageCircle size={28} className="text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Todavía no se envió ningún mensaje
              </p>
              <p className="max-w-xs text-xs text-slate-400">
                Cuando corra el Reclamador Automático (Bandeja de Trabajo), el historial aparece acá.
              </p>
            </div>
          </Card>
        ) : (
          <Card className="animate-fade-in-up">
            <CardHeader title="Recordatorios enviados" subtitle="Más recientes primero" />
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {resultado.recordatorios.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                      {r.organizationName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatFecha(r.sentAt)} · {formatMonto(r.amountDue, "ARS")}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{r.channel}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </main>
    </>
  );
}
