"use client";

// Fase 5.13 — card de selección multi-candidato, para casos NEEDS_DECISION
// por ambigüedad (varios candidatos reales, sin ganador claro). Mismo
// espíritu que RevisionHumanaCard.tsx (Fase 5.12): "ConcilIA ya hizo el
// trabajo pesado, vos elegís entre las opciones reales que encontró" — nunca
// un candidato inventado, siempre los mismos que ya calculó el motor real
// (`topCandidates`). Ninguna acción de esta card ejecuta nada contable —
// ver human-review-actions.ts.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { elegirCandidatoAction, rechazarTodosLosCandidatosAction, type CasoAmbiguoDTO } from "@/app/conciliacion/human-review-actions";
import { CheckCircle2, XCircle, Loader2, Split } from "lucide-react";

function formatMonto(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("es-AR")}`;
  }
}

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function CasoAmbiguoCard({ caso }: { caso: CasoAmbiguoDTO }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [procesando, setProcesando] = useState<string | null>(null); // unitCode en curso, o "RECHAZAR_TODOS"
  const [mostrarRechazoTotal, setMostrarRechazoTotal] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function elegir(unitCode: string) {
    setProcesando(unitCode);
    const r = await elegirCandidatoAction(caso.paymentTransactionId, unitCode);
    setProcesando(null);
    if (r.ok) {
      showToast("Elegido", `UF ${unitCode} — decisión registrada`);
      router.refresh();
    } else {
      showToast("No se pudo registrar la elección", r.error);
    }
  }

  async function rechazarTodos() {
    if (!motivo.trim()) {
      showToast("Falta el motivo", "El rechazo necesita una explicación breve.");
      return;
    }
    setProcesando("RECHAZAR_TODOS");
    const r = await rechazarTodosLosCandidatosAction(caso.paymentTransactionId, motivo);
    setProcesando(null);
    if (r.ok) {
      showToast("Rechazados todos", `${caso.candidatos.length} candidato(s) — motivo registrado`);
      router.refresh();
    } else {
      showToast("No se pudo registrar el rechazo", r.error);
    }
  }

  return (
    <Card className="animate-fade-in-up">
      <div className="space-y-4 p-5">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            <Split size={13} />
            Pago ambiguo — {caso.candidatos.length} candidatos posibles
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatMonto(caso.amount, caso.currency)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {formatFecha(caso.transactionDate)}
            {caso.payerIdentifier ? ` · CUIT ${caso.payerIdentifier}` : ""}
            {caso.referenceNumber ? ` · Ref. ${caso.referenceNumber}` : ""} · {caso.organizationName}
          </p>
          {caso.concept ? <p className="text-xs text-slate-400 dark:text-slate-500">{caso.concept}</p> : null}
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{caso.explanation}</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Elegí la unidad correcta</p>
          {caso.candidatos.map((candidato) => (
            <div
              key={candidato.unitCode}
              className="flex flex-col items-start justify-between gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center dark:border-slate-800"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">UF {candidato.unitCode}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone={candidato.score >= 60 ? "amber" : "slate"}>Score {candidato.score}</Badge>
                  {candidato.tier ? <Badge tone="slate">Tier {candidato.tier}</Badge> : null}
                </div>
                {candidato.matchedSignals.length > 0 ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Señales: {candidato.matchedSignals.join(", ")}</p>
                ) : null}
              </div>
              <Button size="sm" variant="success" onClick={() => elegir(candidato.unitCode)} disabled={procesando !== null} className="w-full shrink-0 sm:w-auto">
                {procesando === candidato.unitCode ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Elegir esta
              </Button>
            </div>
          ))}
        </div>

        {mostrarRechazoTotal ? (
          <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/20">
            <label className="block text-xs font-medium text-rose-700 dark:text-rose-400">¿Por qué ninguno de estos candidatos es correcto?</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Ej.: el pago corresponde a una unidad que no aparece entre las opciones..."
              className="w-full rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-rose-400 dark:border-rose-900 dark:bg-slate-900"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setMostrarRechazoTotal(false)} disabled={procesando !== null}>
                Cancelar
              </Button>
              <Button variant="destructive" size="sm" onClick={rechazarTodos} disabled={procesando !== null || !motivo.trim()}>
                {procesando === "RECHAZAR_TODOS" ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                Confirmar — ninguno es correcto
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end pt-1">
            <Button variant="destructive" onClick={() => setMostrarRechazoTotal(true)} disabled={procesando !== null}>
              <XCircle size={15} />
              Ninguno es correcto
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
