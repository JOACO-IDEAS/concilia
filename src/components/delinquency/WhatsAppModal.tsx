"use client";

import { useEffect, useState } from "react";
import { X, MessageCircle, Check, Link2, Loader2, Copy, ClipboardCheck } from "lucide-react";
import { formatARS } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import type { UnidadFuncional } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

type Status = "idle" | "sending" | "sent";

export function WhatsAppModal({
  unidad,
  onClose,
}: {
  unidad: UnidadFuncional;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [copied, setCopied] = useState(false);
  const { state, enviarRecordatorios } = useAppStore();
  const { showToast } = useToast();
  const consorcio = state.consorcios.find((c) => c.id === unidad.consorcioId);
  const totalAdeudado = unidad.saldoPendiente;
  const magicLink = `https://pagos.conciliia.app/mg/${unidad.id.slice(-4)}${unidad.consorcioId.slice(-1)}`;

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  function enviar() {
    setStatus("sending");
    window.setTimeout(() => {
      setStatus("sent");
      enviarRecordatorios([unidad.id], "whatsapp");
      showToast(
        "Mensaje de WhatsApp despachado con éxito",
        `${unidad.titular} · ${unidad.telefono}`
      );
    }, 1400);
  }

  async function copiarMagicLink() {
    try {
      await navigator.clipboard.writeText(magicLink);
    } catch {
      // clipboard API no disponible; el usuario puede copiar el link manualmente
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const mensaje = `Hola ${unidad.titular.split(" ")[0]} 👋 Te escribimos de *${consorcio?.nombre}*.\n\nTenés expensas pendientes por *${formatARS(totalAdeudado)}* (${unidad.diasAtraso} días de atraso).\n\nPodés pagar al instante con este link seguro:\n${magicLink}\n\n¡Gracias! 🏢`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-md flex-col animate-toast-in overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-slate-900"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <MessageCircle size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Recordatorio por WhatsApp
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {unidad.titular} · {unidad.telefono}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-2xl rounded-tl-sm bg-emerald-50 p-4 text-sm leading-relaxed text-slate-700 dark:bg-emerald-500/10 dark:text-slate-200">
            {mensaje.split("\n").map((line, i) => (
              <p key={i} className={line === "" ? "h-2" : ""}>
                {line.startsWith("https://") ? (
                  <span className="inline-flex items-start gap-1 break-all font-medium text-blue-600 underline dark:text-blue-400">
                    <Link2 size={13} className="mt-0.5 shrink-0" />
                    {line}
                  </span>
                ) : (
                  line.split("*").map((part, j) =>
                    j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                  )
                )}
              </p>
            ))}
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800">
            <Link2 size={14} className="shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-600 dark:text-slate-300">
              {magicLink}
            </span>
            <button
              type="button"
              onClick={copiarMagicLink}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                copied
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
              }`}
            >
              {copied ? (
                <>
                  <ClipboardCheck size={13} className="animate-conciliia-pop" />
                  ¡Copiado!
                </>
              ) : (
                <>
                  <Copy size={13} />
                  Copiar Magic Link
                </>
              )}
            </button>
          </div>

          <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            El Magic Link expira en 72 hs y permite pagar con tarjeta, transferencia o
            Mercado Pago sin necesidad de loguearse.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
          {status === "sent" ? (
            <div className="flex w-full items-center justify-between gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              <span className="flex items-center gap-2">
                <Check size={16} />
                Recordatorio enviado a {unidad.telefono}
              </span>
              <button
                onClick={onClose}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={enviar}
                disabled={status === "sending"}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-70"
              >
                {status === "sending" ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Enviando…
                  </>
                ) : (
                  <>
                    <MessageCircle size={15} />
                    Simular envío de WhatsApp
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
