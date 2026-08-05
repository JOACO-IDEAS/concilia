import { Topbar } from "@/components/layout/Topbar";
import { EntradaDatosCard } from "@/components/centro-de-control/EntradaDatosCard";
import { BandejaInconsistenciasCard } from "@/components/centro-de-control/BandejaInconsistenciasCard";
import { CobranzaMoraCard } from "@/components/centro-de-control/CobranzaMoraCard";
import { obtenerBandejaInconsistencias } from "./actions";
import { getOverdueOrganizations } from "@/app/morosidad/actions";

// Igual que /conciliacion y /morosidad: datos reales que cambian todo el
// tiempo (pagos entrantes, recordatorios enviados) — nunca cacheado como
// estático.
export const dynamic = "force-dynamic";

export default async function CentroDeControlPage() {
  const [bandeja, mora] = await Promise.all([
    obtenerBandejaInconsistencias(),
    getOverdueOrganizations(),
  ]);

  return (
    <>
      <Topbar
        title="Centro de Control"
        subtitle="Todo lo que necesitás hacer hoy, en un solo lugar — Cero Ficción"
      />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <EntradaDatosCard />
        <BandejaInconsistenciasCard datosIniciales={bandeja} />
        <CobranzaMoraCard datosIniciales={mora} />
      </main>
    </>
  );
}
