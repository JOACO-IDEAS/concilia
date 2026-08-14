import { Suspense } from "react";
import Link from "next/link";
import { DoorOpen, UploadCloud } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { ConsorciosPanel } from "@/components/consorcios/ConsorciosPanel";

export default function ConsorciosPage() {
  return (
    <>
      <Topbar
        title="Consorcios"
        subtitle="Información operativa de tus consorcios"
      />
      <main className="flex-1 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap justify-end gap-4">
          <Link
            href="/unidades-config"
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            <DoorOpen size={13} />
            Unidades y titulares
          </Link>
          <Link
            href="/importar"
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            <UploadCloud size={13} />
            Importar consorcios desde Excel/CSV
          </Link>
        </div>
        <Suspense fallback={<div className="text-sm text-slate-400">Cargando consorcios…</div>}>
          <ConsorciosPanel />
        </Suspense>
      </main>
    </>
  );
}
