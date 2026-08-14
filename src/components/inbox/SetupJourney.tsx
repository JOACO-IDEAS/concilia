import Link from "next/link";
import { AlertCircle, CheckCircle2, CircleDashed } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { SetupJourneyViewModel, SetupStep } from "./operational-inbox-view-model";

function StepIcon({ state }: { state: SetupStep["state"] }) {
  if (state === "COMPLETE") return <CheckCircle2 size={18} className="text-emerald-600" />;
  if (state === "BLOCKED") return <AlertCircle size={18} className="text-amber-600" />;
  if (state === "CURRENT") return <CircleDashed size={18} className="text-blue-600" />;
  return <CircleDashed size={18} className="text-slate-300 dark:text-slate-600" />;
}

/**
 * Estado vacío de Inicio — organización sin ninguna decisión todavía.
 * Reemplaza el journey de 6 hitos por 3 pasos máximo (agregados, nunca
 * inventados — ver `buildSetupJourney`) con una única CTA primaria. Sin
 * enlaces inferiores competidores: una sola acción a la vez.
 */
export function SetupJourney({ journey }: { journey: SetupJourneyViewModel }) {
  return (
    <Card>
      <div className="p-4 sm:p-6">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{journey.greetingContext.title}</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{journey.greetingContext.explanation}</p>
      </div>
      <ol className="border-t border-slate-100 dark:border-slate-800">
        {journey.steps.map((step, index) => (
          <li key={step.key} className="flex items-start gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 sm:px-6 dark:border-slate-800">
            <span className="mt-0.5 shrink-0"><StepIcon state={step.state} /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{index + 1}. {step.title}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      {journey.primaryCta ? (
        <div className="flex justify-end border-t border-slate-100 px-4 py-4 sm:px-6 dark:border-slate-800">
          <Link href={journey.primaryCta.href} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{journey.primaryCta.actionLabel}</Link>
        </div>
      ) : null}
    </Card>
  );
}
