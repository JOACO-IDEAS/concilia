import { Topbar } from "@/components/layout/Topbar";
import { ConciliacionTabs } from "@/components/conciliacion/ConciliacionTabs";
import { obtenerPagosWebhook, obtenerBandejaInconsistencias } from "./payments-actions";

// Los pagos por webhook pueden llegar en cualquier momento — esta página no
// debe quedar prerenderizada como estática en el build (Next la trataría
// como una foto congelada del momento del deploy). Se renderiza en cada
// request para que siempre muestre datos frescos.
export const dynamic = "force-dynamic";

export default async function ConciliacionPage() {
  const [datosWebhooks, bandeja] = await Promise.all([
    obtenerPagosWebhook(),
    obtenerBandejaInconsistencias(),
  ]);

  return (
    <>
      <Topbar
        title="Conciliación"
        subtitle="ConcilIA propone una unidad para cada pago — vos revisás lo que falta."
      />
      <main className="flex-1 p-4 sm:p-6">
        <ConciliacionTabs datosWebhooks={datosWebhooks} bandeja={bandeja} />
      </main>
    </>
  );
}
