"use client";

import { useEffect, useState } from "react";
import { Sparkles, X, Loader2, Check, CircleAlert, Mail, MessageCircle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  obtenerSugerenciasSmartMatch,
  vincularPagoManualmente,
  type PagoWebhookDTO,
} from "@/app/conciliacion/payments-actions";
import type { SugerenciaSmartMatch } from "@/lib/payments/smart-match";

function formatMonto(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("es-AR")}`;
  }
}

function colorConfianza(confidence: number): string {
  if (confidence >= 70) return "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10";
  if (confidence >= 40) return "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10";
  return "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800";
}

function textoConfianza(confidence: number): string {
  if (confidence >= 70) return "text-emerald-700 dark:text-emerald-400";
  if (confidence >= 40) return "text-amber-700 dark:text-amber-400";
  return "text-slate-600 dark:text-slate-300";
}

export function SmartMatchModal({
  pago,
  onClose,
  onAprobado,
}: {
  pago: PagoWebhookDTO;
  onClose: () => void;
  onAprobado: (organizationId: string, organizationName: string) => void;
}) {
  const { showToast } = useToast();
  const [cargando, setCargando] = useState(true);
  const [sugerencias, setSugerencias] = useState<SugerenciaSmartMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aprobando, setAprobando] = useState<string | null>(null);
  const [aprobado, setAprobado] = useState<{ organizationId: string; organizationName: string } | null>(
    null
  );

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (aprobado) onAprobado(aprobado.organizationId, aprobado.organizationName);
      else onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose, onAprobado, aprobado]);

  useEffect(() => {
    let cancelado = false;
    obtenerSugerenciasSmartMatch(pago.id).then((resultado) => {
      if (cancelado) return;
      setCargando(false);
      if (resultado.ok) {
        setSugerencias(resultado.sugerencias);
      } else {
        setError(resultado.error ?? "No se pudieron calcular sugerencias.");
      }
    });
    return () => {
      cancelado = true;
    };
  }, [pago.id]);

  async function aprobar(sugerencia: SugerenciaSmartMatch) {
    setAprobando(sugerencia.organizationId);
    const resultado = await vincularPagoManualmente(pago.id, sugerencia.organizationId);
    setAprobando(null);
    if (resultado.ok) {
      showToast("Coincidencia aprobada", `Vinculado a ${sugerencia.organizationName}`);
      // No se cierra el modal todavía — se muestra el indicador de envío de
      // notificaciones (Email + WhatsApp, disparadas en segundo plano con
      // after() desde vincularPagoManualmente) y recién al cerrar se avisa
      // al panel padre para que actualice la fila.
      setAprobado({ organizationId: sugerencia.organizationId, organizationName: sugerencia.organizationName });
    } else {
      showToast("No se pudo aprobar la coincidencia", resultado.error);
    }
  }

  function cerrarLuegoDeAprobar() {
    if (!aprobado) return;
    onAprobado(aprobado.organizationId, aprobado.organizationName);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={aprobado ? cerrarLuegoDeAprobar : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col animate-toast-in overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-slate-900"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
              <Sparkles size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Sugerencias Inteligentes
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatMonto(pago.amount, pago.currency)} · {pago.payerIdentifier ?? "Sin identificar"}
              </p>
            </div>
          </div>
          <button
            onClick={aprobado ? cerrarLuegoDeAprobar : onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-5">
          {aprobado ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                <Check size={22} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Vinculado a {aprobado.organizationName}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Notificando al contacto en segundo plano
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Mail size={13} className="text-blue-500" /> Email enviado
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageCircle size={13} className="text-emerald-500" /> Notificación enviada por WhatsApp
                </span>
              </div>
              <button
                onClick={cerrarLuegoDeAprobar}
                className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <>
              {pago.concept ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Concepto: <span className="text-slate-700 dark:text-slate-300">{pago.concept}</span>
                </p>
              ) : null}

              {cargando ? (
                <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                  <Loader2 size={22} className="animate-spin" />
                  <p className="text-xs">Buscando coincidencias posibles…</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <CircleAlert size={22} className="text-rose-500" />
                  <p className="text-sm text-slate-600 dark:text-slate-300">{error}</p>
                </div>
              ) : sugerencias.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <CircleAlert size={22} className="text-slate-400" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    No encontramos coincidencias probables
                  </p>
                  <p className="mx-auto max-w-xs text-xs text-slate-500 dark:text-slate-400">
                    Vinculá este pago a mano desde la tabla de Webhooks.
                  </p>
                </div>
              ) : (
                sugerencias.map((s) => (
                  <div
                    key={s.organizationId}
                    className={`rounded-xl border p-3.5 ${colorConfianza(s.confidence)}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {s.organizationName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">CUIT {s.taxId}</p>
                        <p className={`mt-1 text-xs ${textoConfianza(s.confidence)}`}>{s.motivo}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${textoConfianza(s.confidence)}`}
                      >
                        {s.confidence}%
                      </span>
                    </div>
                    <button
                      onClick={() => aprobar(s)}
                      disabled={aprobando !== null}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {aprobando === s.organizationId ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Check size={13} />
                      )}
                      Aprobar Coincidencia
                    </button>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
