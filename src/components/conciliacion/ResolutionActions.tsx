"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import { EvidenceList } from "./EvidenceList";
import { RejectionForm } from "./RejectionForm";
import {
  aprobarDecisionHumanaAction,
  elegirCandidatoAction,
  rechazarDecisionHumanaAction,
  rechazarTodosLosCandidatosAction,
} from "@/app/conciliacion/human-review-actions";
import type { ResolutionWorkspaceData } from "@/app/conciliacion/resolver/resolution-workspace-data";

/**
 * E (Decisión humana). Cuando hay varios candidatos (D), la comparación vive
 * en el mismo bloque porque la acción de elegir es por candidato — separarla
 * en una Card aparte obligaría a repetir cada candidato sin ganar claridad.
 */
export function ResolutionActions({
  paymentId,
  proposal,
}: {
  paymentId: string;
  proposal: NonNullable<ResolutionWorkspaceData["proposal"]>;
}) {
  const { showToast } = useToast();
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const isBusy = pending !== null;

  async function run(label: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(label);
    const result = await action();
    setPending(null);
    if (result.ok) {
      showToast("Decisión registrada", "El historial del caso fue actualizado.");
      setRejectingId(null);
      router.refresh();
    } else {
      showToast("No se pudo registrar", result.error);
    }
  }

  if (proposal.kind === "AMBIGUOUS") {
    return (
      <div className="space-y-4">
        {proposal.candidates.length > 0 ? (
          <div className="space-y-2">
            {proposal.candidates.map((candidate) => (
              <div key={candidate.unitCode} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold">UF {candidate.unitCode}</p>
                  <Button
                    size="sm"
                    variant="success"
                    disabled={isBusy}
                    onClick={() => run(candidate.unitCode, () => elegirCandidatoAction(paymentId, candidate.unitCode))}
                  >
                    {pending === candidate.unitCode ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    Elegir esta
                  </Button>
                </div>
                <div className="mt-2">
                  <EvidenceList
                    items={candidate.matchedSignals}
                    emptyMessage="Sin señales adicionales que la distingan de las demás."
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            No hay candidatos legibles disponibles en esta evaluación.{" "}
            <a className="font-semibold text-blue-600 hover:underline" href="/conciliacion">
              Ir a Conciliación
            </a>
          </p>
        )}

        {rejectingId === "all" ? (
          <RejectionForm
            question="¿Por qué ninguno es correcto?"
            pending={isBusy}
            onCancel={() => setRejectingId(null)}
            onConfirm={(reason) => run("reject-all", () => rechazarTodosLosCandidatosAction(paymentId, reason))}
          />
        ) : (
          <Button variant="destructive" onClick={() => setRejectingId("all")} disabled={isBusy}>
            <XCircle size={15} />
            Ninguno es correcto
          </Button>
        )}
      </div>
    );
  }

  if (!proposal.unitId) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-300">
        La unidad propuesta ya no está disponible. Investigá el caso antes de decidir.
      </p>
    );
  }

  return rejectingId === "single" ? (
    <RejectionForm
      question="¿Por qué se rechaza?"
      pending={isBusy}
      onCancel={() => setRejectingId(null)}
      onConfirm={(reason) => run("reject", () => rechazarDecisionHumanaAction(paymentId, proposal.unitId!, reason))}
    />
  ) : (
    <div className="flex flex-wrap gap-2">
      <Button variant="destructive" onClick={() => setRejectingId("single")} disabled={isBusy}>
        <XCircle size={15} />
        Rechazar
      </Button>
      <Button
        variant="success"
        onClick={() => run("approve", () => aprobarDecisionHumanaAction(paymentId, proposal.unitId!))}
        disabled={isBusy}
      >
        {pending === "approve" ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
        Aprobar sugerencia
      </Button>
    </div>
  );
}
