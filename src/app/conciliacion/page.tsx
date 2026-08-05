import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { ConciliacionTabs } from "@/components/conciliacion/ConciliacionTabs";
import { obtenerPagosWebhook } from "./payments-actions";

// Los pagos por webhook pueden llegar en cualquier momento — esta página no
// debe quedar prerenderizada como estática en el build (Next la trataría
// como una foto congelada del momento del deploy). Se renderiza en cada
// request para que la pestaña de Webhooks siempre muestre datos frescos.
export const dynamic = "force-dynamic";

export default async function ConciliacionPage() {
  const datosWebhooks = await obtenerPagosWebhook();

  return (
    <>
      <Topbar
        title="Conciliación Bancaria"
        subtitle="La IA prepara el match con cada Unidad Funcional — vos aprobás en 1 clic"
      />
      <main className="flex-1 p-4 sm:p-6">
        <div className="mb-4 flex justify-end">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            <BarChart3 size={13} />
            Ver analítica
          </Link>
        </div>
        <ConciliacionTabs datosWebhooks={datosWebhooks} />
      </main>
    </>
  );
}
