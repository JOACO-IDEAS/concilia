import { Topbar } from "@/components/layout/Topbar";
import { ObligacionesImportWizard } from "@/components/obligaciones/ObligacionesImportWizard";
import { listarOrganizacionesParaUnidades } from "@/app/unidades-config/actions";

export default async function ImportarObligacionesPage() {
  const organizaciones = await listarOrganizacionesParaUnidades();

  return (
    <>
      <Topbar
        title="Importar Obligaciones"
        subtitle="Cargá la liquidación de expensas de un consorcio desde Excel o CSV"
      />
      <main className="flex-1 p-4 sm:p-6">
        <ObligacionesImportWizard organizaciones={organizaciones} />
      </main>
    </>
  );
}
