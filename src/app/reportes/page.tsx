import { Topbar } from "@/components/layout/Topbar";
import { ReportesPanel } from "@/components/reportes/ReportesPanel";

export default function ReportesPage() {
  return (
    <>
      <Topbar
        title="Reportes"
        subtitle="Liquidación de expensas y flujo de caja, listos para exportar"
      />
      <main className="flex-1 p-4 sm:p-6">
        <ReportesPanel />
      </main>
    </>
  );
}
