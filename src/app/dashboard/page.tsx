import { Suspense } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { AnalyticsDashboardContent } from "@/components/dashboard/analytics/AnalyticsDashboardContent";
import { AnalyticsSkeleton } from "@/components/dashboard/analytics/AnalyticsSkeleton";

// Métricas de cobranza en tiempo real — nunca debe quedar prerenderizada
// como estática (ver el mismo criterio en /conciliacion).
export const dynamic = "force-dynamic";

export default function AnalyticsDashboardPage() {
  return (
    <>
      <Topbar
        title="Analítica"
        subtitle="Cobranzas y reconciliación en tiempo real — datos reales de Open Banking"
      />
      <main className="flex-1 p-4 sm:p-6">
        <Suspense fallback={<AnalyticsSkeleton />}>
          <AnalyticsDashboardContent />
        </Suspense>
      </main>
    </>
  );
}
