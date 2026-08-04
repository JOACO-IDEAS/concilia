import { Suspense } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { UnidadesPanel } from "@/components/unidades/UnidadesPanel";

export default function UnidadesPage() {
  return (
    <>
      <Topbar
        title="Unidades Funcionales"
        subtitle="Ficha completa: cuenta corriente, pagos y extractos vinculados"
      />
      <main className="flex-1 p-4 sm:p-6">
        <Suspense fallback={<div className="text-sm text-slate-400">Cargando unidades…</div>}>
          <UnidadesPanel />
        </Suspense>
      </main>
    </>
  );
}
