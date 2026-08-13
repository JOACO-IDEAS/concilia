import { Topbar } from "@/components/layout/Topbar";
import { OrganizacionesImportWizard } from "@/components/import/OrganizacionesImportWizard";

export default function ImportarPage() {
  return (
    <>
      <Topbar
        title="Importar Datos"
        subtitle="Cargá consorcios, contactos y datos de facturación desde Excel o CSV"
      />
      <main className="flex-1 p-4 sm:p-6">
        <OrganizacionesImportWizard />
      </main>
    </>
  );
}
