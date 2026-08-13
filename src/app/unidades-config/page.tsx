import { Topbar } from "@/components/layout/Topbar";
import { UnidadesConfigPanel } from "@/components/unidades-config/UnidadesConfigPanel";
import { listarOrganizacionesParaUnidades } from "./actions";

export default async function UnidadesConfigPage() {
  const organizaciones = await listarOrganizacionesParaUnidades();

  return (
    <>
      <Topbar
        title="Consorcios y unidades"
        subtitle="Elegí un consorcio y mantené su padrón operativo"
      />
      <main className="flex-1 p-4 sm:p-6">
        <UnidadesConfigPanel organizacionesIniciales={organizaciones} />
      </main>
    </>
  );
}
