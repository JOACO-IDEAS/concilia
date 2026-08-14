import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { OperationalEmptyState } from "./OperationalEmptyState";
import type { InformationCase } from "./operational-inbox-view-model";

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">{children}<ArrowRight size={13} /></Link>;
}

/** "Requiere información" — movimientos que ConcilIA no pudo resolver con
 * seguridad todavía. Cada caso explica por qué bloquea (evidencia
 * insuficiente), nunca un motivo inventado por caso individual. */
export function InformationQueue({ cases }: { cases: InformationCase[] }) {
  return (
    <Card>
      <CardHeader title="Requiere información" subtitle="Movimientos que todavía no pueden resolverse con seguridad." />
      {cases.length === 0 ? (
        <OperationalEmptyState icon={<CheckCircle2 size={18} className="text-emerald-600" />} message="No hay pagos asociados a tus consorcios esperando más información." />
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {cases.map((payment) => (
            <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Pago sin resolver</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{payment.organizationName} · {payment.amountLabel} · {payment.referenceLabel} · {payment.ageLabel}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{payment.reason}</p>
              </div>
              <ActionLink href={payment.href}>Investigar</ActionLink>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
