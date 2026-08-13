import Link from "next/link";
import { AlertCircle, CheckCircle2, CircleDashed, Clock3 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import type { FirstReviewableCaseStatus, OperationalInboxData } from "@/app/operational-inbox-data";
import { getFirstValueProgress, type FirstValueMilestone } from "@/lib/first-value/progress";

function MilestoneIcon({ milestone }: { milestone: FirstValueMilestone }) {
  if (milestone.state === "COMPLETE") return <CheckCircle2 size={18} className="text-emerald-600" />;
  if (milestone.state === "BLOCKED") return <AlertCircle size={18} className="text-amber-600" />;
  if (milestone.state === "CURRENT") return <CircleDashed size={18} className="text-blue-600" />;
  return <CircleDashed size={18} className="text-slate-400" />;
}

export function FirstValueJourney({ data, firstReviewableStatus, firstReviewableCaseHref }: { data: OperationalInboxData; firstReviewableStatus: FirstReviewableCaseStatus; firstReviewableCaseHref?: string }) {
  const progress = getFirstValueProgress(data, firstReviewableStatus, firstReviewableCaseHref);
  const next = progress.milestones.find((milestone) => milestone.state === "CURRENT" || milestone.state === "BLOCKED");

  return <Card>
    <CardHeader title="Tu progreso hacia el primer caso" subtitle="Cada hito refleja información real de tus consorcios." />
    <ol className="divide-y divide-slate-100 dark:divide-slate-800">
      {progress.milestones.map((milestone, index) => <li key={milestone.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3"><div className="mt-0.5 shrink-0"><MilestoneIcon milestone={milestone} /></div><div><p className="text-sm font-semibold">{index + 1}. {milestone.title}</p><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{milestone.detail}</p></div></div>
        {milestone.href ? <Link href={milestone.href} className="shrink-0 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">{milestone.action}</Link> : null}
        {!milestone.href && milestone.state === "CURRENT" ? <span className="flex shrink-0 items-center gap-1 text-xs text-blue-600 dark:text-blue-400"><Clock3 size={13} />En proceso</span> : null}
        {milestone.state === "PENDING" ? <span className="shrink-0 text-xs text-slate-400">Pendiente</span> : null}
        {milestone.state === "BLOCKED" ? <span className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-400">Necesita atención</span> : null}
      </li>)}
    </ol>
    {next ? <p className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">Siguiente paso: <span className="font-semibold text-slate-700 dark:text-slate-200">{next.title}</span>.</p> : null}
  </Card>;
}
