"use client";

// Fase 5.12 — una card por caso revisable. "ConcilIA ya hizo el trabajo
// pesado, vos solo validás la excepción" (pedido explícito): la sugerencia
// va primero y con más peso visual que los datos crudos del pago. Un
// rechazo exige escribir un motivo (auditabilidad real) — nunca hay un
// default silencioso. Ningún botón de esta card ejecuta nada contable: la
// única llamada es a `aprobarDecisionHumanaAction`/`rechazarDecisionHumanaAction`
// (Server Actions, Fase 5.12), que a su vez solo escriben `ReconciliationMatch`.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { aprobarDecisionHumanaAction, rechazarDecisionHumanaAction, type CasoRevisableDTO } from "@/app/conciliacion/human-review-actions";
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";

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

const ETIQUETA_ESTADO: Record<CasoRevisableDTO["state"], { texto: string; tono: "green" | "blue" | "amber" }> = {
  RECONCILIATION_CONFIRMED: { texto: "RECONCILIATION_CONFIRMED — evidencia convergente", tono: "green" },
  PRE_CONCILIABLE: { texto: "PRE_CONCILIABLE — una familia fuerte, sin corroborar", tono: "blue" },
  NEEDS_DECISION: { texto: "NEEDS_DECISION — hay una contradicción activa", tono: "amber" },
};

export function RevisionHumanaCard({ caso }: { caso: CasoRevisableDTO }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [procesando, setProcesando] = useState(false);
  const [mostrarRechazo, setMostrarRechazo] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function aprobar() {
    setProcesando(true);
    const r = await aprobarDecisionHumanaAction(caso.paymentTransactionId, caso.candidateUnitId);
    setProcesando(false);
    if (r.ok) {
      showToast("Aprobado", `UF ${caso.unitCode} — decisión registrada`);
      router.refresh();
    } else {
      showToast("No se pudo aprobar", r.error);
    }
  }

  async function rechazar() {
    if (!motivo.trim()) {
      showToast("Falta el motivo", "El rechazo necesita una explicación breve.");
      return;
    }
    setProcesando(true);
    const r = await rechazarDecisionHumanaAction(caso.paymentTransactionId, caso.candidateUnitId, motivo);
    setProcesando(false);
    if (r.ok) {
      showToast("Rechazado", `UF ${caso.unitCode} — motivo registrado`);
      router.refresh();
    } else {
      showToast("No se pudo rechazar", r.error);
    }
  }

  const estado = ETIQUETA_ESTADO[caso.state];
  const señales = caso.structuredEvidence?.bank?.signals.filter((s) => s.matched) ?? [];
  const bloqueos = caso.structuredEvidence?.bank?.blockers ?? [];

  return (
    <Card className="animate-fade-in-up">
      <div className="space-y-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Pago para revisar</p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatMonto(caso.amount, caso.currency)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {formatFecha(caso.transactionDate)}
            {caso.payerIdentifier ? ` · CUIT ${caso.payerIdentifier}` : ""}
            {caso.referenceNumber ? ` · Ref. ${caso.referenceNumber}` : ""}
          </p>
          {caso.concept ? <p className="text-xs text-slate-400 dark:text-slate-500">{caso.concept}</p> : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Sugerencia de ConcilIA</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
            UF {caso.unitCode} <span className="font-normal text-slate-500 dark:text-slate-400">— {caso.organizationName}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {caso.score !== null ? <Badge tone={caso.score >= 80 ? "green" : caso.score >= 50 ? "amber" : "slate"}>Score {caso.score}</Badge> : null}
            <Badge tone={estado.tono}>{estado.texto}</Badge>
          </div>

          {señales.length > 0 ? (
            <div className="mt-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">¿Por qué?</p>
              <ul className="mt-1 space-y-0.5 text-sm text-slate-700 dark:text-slate-300">
                {señales.map((s) => (
                  <li key={s.signal} className="flex items-start gap-1.5">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                    {s.evidence}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {caso.hasContradiction ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-400">Contradicción</p>
              <p className="mt-0.5 text-sm text-amber-900 dark:text-amber-200">{caso.contradictionDetail ?? caso.explanation}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">{caso.explanation}</p>
        )}

        {bloqueos.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Evidencia adicional</p>
            <ul className="mt-1 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
              {bloqueos.map((b, i) => (
                <li key={i}>— {b.evidence}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {mostrarRechazo ? (
          <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/20">
            <label className="block text-xs font-medium text-rose-700 dark:text-rose-400">¿Por qué se rechaza?</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Ej.: no corresponde a esta unidad, el titular real es otro..."
              className="w-full rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-rose-400 dark:border-rose-900 dark:bg-slate-900"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setMostrarRechazo(false)} disabled={procesando}>
                Cancelar
              </Button>
              <Button variant="destructive" size="sm" onClick={rechazar} disabled={procesando || !motivo.trim()}>
                {procesando ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                Confirmar rechazo
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="destructive" onClick={() => setMostrarRechazo(true)} disabled={procesando}>
              <XCircle size={15} />
              Rechazar
            </Button>
            <Button variant="success" onClick={aprobar} disabled={procesando}>
              {procesando ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              Aprobar
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
