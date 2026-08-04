import { Topbar } from "@/components/layout/Topbar";
import { ConsorciosPanel } from "@/components/consorcios/ConsorciosPanel";

export default function ConsorciosPage() {
  return (
    <>
      <Topbar
        title="Consorcios"
        subtitle="Detalle financiero individual por edificio"
      />
      <main className="flex-1 p-4 sm:p-6">
        <ConsorciosPanel />
      </main>
    </>
  );
}
