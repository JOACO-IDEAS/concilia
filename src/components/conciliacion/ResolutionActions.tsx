"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { aprobarDecisionHumanaAction, elegirCandidatoAction, rechazarDecisionHumanaAction, rechazarTodosLosCandidatosAction } from "@/app/conciliacion/human-review-actions";
import type { ResolutionWorkspaceData } from "@/app/conciliacion/resolver/resolution-workspace-data";

export function ResolutionActions({ paymentId, proposal }: { paymentId: string; proposal: NonNullable<ResolutionWorkspaceData["proposal"]> }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function run(label: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(label);
    const result = await action();
    setPending(null);
    if (result.ok) { showToast("Decisión registrada", "El historial del caso fue actualizado."); router.refresh(); }
    else showToast("No se pudo registrar", result.error);
  }

  if (proposal.kind === "AMBIGUOUS") return <div className="space-y-3">
    {proposal.candidates.length > 0 ? proposal.candidates.map((candidate) => <div key={candidate.unitCode} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div><p className="text-sm font-semibold">UF {candidate.unitCode}</p>{candidate.matchedSignals.length > 0 ? <p className="text-xs text-slate-500">Coincidencias: {candidate.matchedSignals.join(", ")}</p> : null}</div><Button size="sm" variant="success" disabled={pending !== null} onClick={() => run(candidate.unitCode, () => elegirCandidatoAction(paymentId, candidate.unitCode))}>{pending === candidate.unitCode ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Elegir esta</Button></div>) : <p className="text-sm text-slate-600 dark:text-slate-300">No hay candidatos legibles disponibles en esta evaluación. <a className="font-semibold text-blue-600 hover:underline" href="/conciliacion/revision-humana">Abrir revisión humana</a></p>}
    {rejecting ? <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3"><label className="block text-xs font-medium text-rose-700">¿Por qué ninguno es correcto?</label><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className="w-full rounded border border-rose-200 bg-white p-2 text-sm" /><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancelar</Button><Button size="sm" variant="destructive" disabled={!reason.trim() || pending !== null} onClick={() => run("reject-all", () => rechazarTodosLosCandidatosAction(paymentId, reason))}>Confirmar rechazo</Button></div></div> : <Button variant="destructive" onClick={() => setRejecting(true)} disabled={pending !== null}><XCircle />Ninguno es correcto</Button>}
  </div>;

  if (!proposal.unitId) return <p className="text-sm text-slate-600 dark:text-slate-300">La unidad propuesta ya no está disponible. Investigá el caso antes de decidir.</p>;
  return rejecting ? <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3"><label className="block text-xs font-medium text-rose-700">¿Por qué se rechaza?</label><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className="w-full rounded border border-rose-200 bg-white p-2 text-sm" /><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancelar</Button><Button size="sm" variant="destructive" disabled={!reason.trim() || pending !== null} onClick={() => run("reject", () => rechazarDecisionHumanaAction(paymentId, proposal.unitId!, reason))}>Confirmar rechazo</Button></div></div> : <div className="flex flex-wrap gap-2"><Button variant="destructive" onClick={() => setRejecting(true)} disabled={pending !== null}><XCircle />Rechazar</Button><Button variant="success" onClick={() => run("approve", () => aprobarDecisionHumanaAction(paymentId, proposal.unitId!))} disabled={pending !== null}>{pending === "approve" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Aprobar sugerencia</Button></div>;
}
