import { CircleAlert, History, Landmark, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { ReconciliationIntelligenceViewModel } from "@/lib/payer-identity/reconciliation-intelligence-view-model";
import { EvidenceList } from "./EvidenceList";

export function FinancialIntelligencePanel({ intelligence }: { intelligence: ReconciliationIntelligenceViewModel }) {
  const tone = intelligence.confidenceLabel === "Alta confianza" ? "green" : intelligence.confidenceLabel === "Requiere revisión" ? "amber" : "slate";
  return (
    <div className="space-y-5" data-resolution-status={intelligence.status}>
      <section aria-labelledby="intelligence-heading" className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <Sparkles aria-hidden="true" size={19} className="mt-0.5 shrink-0 text-blue-600" />
            <div className="min-w-0">
              <h3 id="intelligence-heading" className="text-sm font-semibold text-slate-950">{intelligence.heading}</h3>
              <p className="mt-1 text-lg font-bold text-slate-950">{intelligence.summary}</p>
              <p className="mt-1 text-sm text-slate-600">{intelligence.confirmationMessage}</p>
            </div>
          </div>
          <Badge tone={tone}>{intelligence.confidenceLabel}</Badge>
        </div>
      </section>

      {intelligence.historicalConflict ? (
        <div role="alert" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <CircleAlert aria-hidden="true" size={17} className="mt-0.5 shrink-0" />
          <span><strong>La evidencia actual y el historial no coinciden.</strong> Revisá los candidatos antes de decidir.</span>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="financial-evidence-heading" className="rounded-lg border border-slate-200 p-4">
          <h4 id="financial-evidence-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><Landmark aria-hidden="true" size={16} className="text-blue-600" />Evidencia financiera</h4>
          <EvidenceList items={intelligence.financialEvidence} emptyMessage="No hay evidencia financiera legible adicional." />
        </section>
        <section aria-labelledby="historical-evidence-heading" className="rounded-lg border border-slate-200 p-4">
          <h4 id="historical-evidence-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><History aria-hidden="true" size={16} className="text-violet-600" />Historial</h4>
          <EvidenceList items={intelligence.historicalEvidence} emptyMessage="No existe historial aplicable para este pagador o señal." />
        </section>
      </div>

      {intelligence.candidates.length > 1 ? (
        <section aria-labelledby="candidate-comparison-heading">
          <h4 id="candidate-comparison-heading" className="mb-2 text-sm font-semibold text-slate-900">Alternativas</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {intelligence.candidates.map((candidate) => (
              <article key={candidate.unitId} className="min-w-0 rounded-lg border border-slate-200 p-3">
                <p className="font-semibold text-slate-900">Unidad {candidate.unitCode}</p>
                <p className="mt-1 text-xs text-slate-500">{candidate.financialEvidence[0]?.text ?? "Sin evidencia financiera legible adicional."}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {intelligence.technicalDetailAvailable ? (
        <details className="rounded-lg border border-slate-200 px-4 py-3 text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-0">Ver evidencia completa</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead className="text-slate-500"><tr><th className="pb-2 pr-4">Unidad</th><th className="pb-2 pr-4">Puntaje financiero</th><th className="pb-2 pr-4">Aporte histórico</th><th className="pb-2">Puntaje de decisión</th></tr></thead>
              <tbody>{intelligence.candidates.map((candidate) => <tr key={candidate.unitId} className="border-t border-slate-100"><td className="py-2 pr-4 font-medium">{candidate.unitCode}</td><td className="py-2 pr-4">{candidate.financialScore}</td><td className="py-2 pr-4">{candidate.historicalContribution}</td><td className="py-2">{candidate.decisionScore}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}
