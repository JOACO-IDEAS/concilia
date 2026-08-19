import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";

export type EvidenceItem = { text: string; status?: "match" | "conflict" | "missing" };

/**
 * Lista de evidencia — bloque reutilizable para B (Propuesta), C (Evidencia)
 * y D (Candidatos) del Resolution Workspace.
 *
 * Hoy `structuredEvidence` sólo trae señales ya coincidentes (`matched:
 * true`), por eso cada string que llega desde `resolution-workspace-data.ts`
 * se normaliza como `status: "match"`. Los estados "conflict"/"missing" ya
 * están tipados para el día en que exista una fuente de evidencia (ej.
 * comprobante) que pueda reportar una discrepancia o una ausencia real —
 * hasta entonces no se inventa evidencia que el backend no expone.
 */
export function EvidenceList({
  items,
  emptyMessage,
}: {
  items: (EvidenceItem | string)[];
  emptyMessage: string;
}) {
  const normalized = items.map((item) => (typeof item === "string" ? { text: item, status: "match" as const } : item));

  if (normalized.length === 0) {
    return <p className="text-sm text-slate-600 dark:text-slate-300">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {normalized.map((item, index) => (
        <li key={index} className="flex gap-2 text-sm">
          {item.status === "conflict" ? (
            <CircleAlert size={15} className="mt-0.5 shrink-0 text-rose-500" />
          ) : item.status === "missing" ? (
            <CircleDashed size={15} className="mt-0.5 shrink-0 text-slate-400" />
          ) : (
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
          )}
          <span
            className={
              item.status === "conflict"
                ? "text-rose-700 dark:text-rose-400"
                : item.status === "missing"
                  ? "text-slate-400 italic dark:text-slate-500"
                  : "text-slate-700 dark:text-slate-200"
            }
          >
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
