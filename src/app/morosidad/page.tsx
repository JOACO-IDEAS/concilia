import { Topbar } from "@/components/layout/Topbar";
import { MorosidadTabs } from "@/components/delinquency/MorosidadTabs";
import { getOverdueOrganizations } from "./actions";

// La morosidad cambia con cada pago conciliado y cada recordatorio enviado —
// no debe quedar cacheada como estática (mismo criterio que /conciliacion).
export const dynamic = "force-dynamic";

export default async function MorosidadPage() {
  const datosMorosidad = await getOverdueOrganizations();

  return (
    <>
      <Topbar
        title="Morosidad & WhatsApp"
        subtitle="Detección automática de mora y reclamos por WhatsApp con 1 clic"
      />
      <main className="flex-1 p-4 sm:p-6">
        <MorosidadTabs datosMorosidad={datosMorosidad} />
      </main>
    </>
  );
}
