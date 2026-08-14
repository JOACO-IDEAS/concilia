import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { NextStep } from "./operational-inbox-view-model";

/** Una única recomendación priorizada — nunca una lista. Si no hay ningún
 * paso urgente (todo al día y sin cola disponible que sugerir), no se
 * renderiza nada: un "siguiente paso" inventado sería peor que ausencia. */
export function RecommendedNextStep({ nextStep }: { nextStep: NextStep | null }) {
  if (!nextStep) return null;
  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <Sparkles size={18} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">Siguiente paso recomendado</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-50">{nextStep.title}</p>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{nextStep.detail}</p>
          </div>
        </div>
        <Link href={nextStep.href} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">{nextStep.actionLabel}<ArrowRight size={13} /></Link>
      </div>
    </Card>
  );
}
