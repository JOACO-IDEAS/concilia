"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Formulario de motivo de rechazo — compartido entre el rechazo de un único
 * candidato y el rechazo de todos los candidatos (antes eran dos bloques
 * casi idénticos duplicados en ResolutionActions).
 */
export function RejectionForm({
  question,
  pending,
  onCancel,
  onConfirm,
}: {
  question: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/50 dark:bg-rose-950/30">
      <label htmlFor="rejection-reason" className="block text-xs font-medium text-rose-700 dark:text-rose-400">
        {question}
      </label>
      <textarea
        id="rejection-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={2}
        autoFocus
        disabled={pending}
        className="w-full rounded border border-rose-200 bg-white p-2 text-sm outline-none focus:border-rose-400 disabled:opacity-60 dark:border-rose-900/50 dark:bg-slate-900"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button size="sm" variant="destructive" disabled={!reason.trim() || pending} onClick={() => onConfirm(reason)}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : null}
          Confirmar rechazo
        </Button>
      </div>
    </div>
  );
}
