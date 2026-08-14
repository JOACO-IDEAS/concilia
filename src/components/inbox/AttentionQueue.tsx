import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { OperationalEmptyState } from "./OperationalEmptyState";
import { CaseMetadata } from "./CaseMetadata";
import type { AttentionCase } from "./operational-inbox-view-model";

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">{children}<ArrowRight size={13} /></Link>;
}

/** "Requiere tu atención" — prioridad principal de Inicio. Vacío legítimo
 * ("Todo al día") es un estado de éxito, no un placeholder. Indisponibilidad
 * de la cola detallada es un estado distinto, honesto, con salida real a
 * Conciliación — nunca se disfraza de "todo al día". */
export function AttentionQueue({ available, cases }: { available: boolean; cases: AttentionCase[] }) {
  return (
    <Card>
      <CardHeader title="Requiere tu atención" subtitle="ConcilIA ya encontró evidencia suficiente para que revises el caso." />
      {!available ? (
        <OperationalEmptyState icon={<CheckCircle2 size={18} className="text-slate-400" />} message="La cola de revisión detallada no está disponible en este entorno todavía." action={<ActionLink href="/conciliacion">Ir a Conciliación</ActionLink>} />
      ) : cases.length === 0 ? (
        <OperationalEmptyState icon={<CheckCircle2 size={18} className="text-emerald-600" />} message="Todo al día. No hay decisiones pendientes." />
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {cases.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{item.title}</p>
                <CaseMetadata items={[{ text: item.organizationName }, { text: item.amountLabel, atomic: true }, { text: item.reason }]} />
              </div>
              <ActionLink href={item.href}>{item.actionLabel}</ActionLink>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
