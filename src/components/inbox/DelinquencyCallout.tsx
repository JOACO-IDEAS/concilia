import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";

/**
 * Bloque secundario de morosidad — nunca protagonista de Inicio. Los datos
 * de mora (organizaciones vencidas, envío de recordatorios por WhatsApp) no
 * forman parte de `getOperationalInboxData()` hoy — agregarlos acá exigiría
 * una consulta nueva, fuera de alcance de esta tarea (ver "Límites
 * técnicos"). Por eso este bloque enlaza a `/morosidad` (ruta real,
 * funcional, con su propio botón de WhatsApp ya conectado a
 * `sendWhatsAppPaymentReminder`) en vez de mostrar un número o un botón de
 * WhatsApp inventado acá.
 */
export function DelinquencyCallout({ href }: { href: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
      <span className="flex min-w-0 items-center gap-3">
        <Wallet size={18} className="shrink-0 text-slate-500 dark:text-slate-400" />
        <span className="min-w-0">
          <span className="block font-semibold text-slate-900 dark:text-slate-50">Cobranza y morosidad</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">Ver consorcios en mora y enviar recordatorios por WhatsApp.</span>
        </span>
      </span>
      <ArrowRight size={16} className="shrink-0 text-slate-400" />
    </Link>
  );
}
