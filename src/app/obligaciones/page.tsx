import { Topbar } from "@/components/layout/Topbar";
import { ObligacionesPanel } from "@/components/obligaciones/ObligacionesPanel";
import { listarOrganizacionesParaUnidades } from "@/app/unidades-config/actions";

export default async function ObligacionesPage() {
  const organizaciones = await listarOrganizacionesParaUnidades();

  return (
    <>
      <Topbar
        title="Obligaciones"
        subtitle="Expensas por unidad y período — base para la conciliación por unidad"
      />
      <main className="flex-1 p-4 sm:p-6">
        <ObligacionesPanel organizacionesIniciales={organizaciones} />
      </main>
    </>
  );
}
