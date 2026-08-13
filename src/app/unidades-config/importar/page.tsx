import { Topbar } from "@/components/layout/Topbar";
import { UnidadesImportWizard } from "@/components/unidades-config/UnidadesImportWizard";
import { listarOrganizacionesParaUnidades } from "../actions";

export default async function ImportarUnidadesPage() {
  const organizaciones = await listarOrganizacionesParaUnidades();

  return (
    <>
      <Topbar
        title="Importar Unidades y Titulares"
        subtitle="Cargá el padrón de un consorcio desde Excel o CSV"
      />
      <main className="flex-1 p-4 sm:p-6">
        <UnidadesImportWizard organizaciones={organizaciones} />
      </main>
    </>
  );
}
