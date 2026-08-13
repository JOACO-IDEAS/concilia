"use client";

import { ImportWizard } from "./ImportWizard";
import { importarOrganizaciones } from "@/app/importar/actions";
import { CAMPOS_DESTINO, type FilaImportacion, type ImportWizardConfig } from "@/lib/import/types";
import { sugerirMapeo, validarFila } from "@/lib/import/validation";

// Config armada del lado del cliente a propósito: `ImportWizard`/`StepConfirm`
// son client components, y una Server Action solo puede cruzar el límite
// servidor→cliente como prop si el componente que la pasa es, a su vez,
// client — armar `confirmar` acá evita cualquier problema de serialización
// de funciones entre Server y Client Components.
const config: ImportWizardConfig = {
  tituloUpload: "Importar consorcios desde Excel o CSV",
  subtituloUpload:
    "Subí una planilla con tus clientes y te ayudamos a mapear las columnas antes de cargarlos",
  camposDestino: CAMPOS_DESTINO,
  sugerirMapeo,
  validarFila,
  entidadPlural: "organizaciones",
  notaActualizacion: "Los consorcios que ya existan (mismo CUIT) se actualizan en vez de duplicarse.",
  linkResultado: { href: "/unidades-config", label: "Cargar unidades" },
  confirmar: (filas: FilaImportacion[]) =>
    importarOrganizaciones(
      filas.map((f) => ({
        name: f.valores.name,
        taxId: f.valores.tax_id,
        contactName: f.valores.contact_name,
        contactEmail: f.valores.contact_email,
        contactPhone: f.valores.contact_phone,
        billingEmail: f.valores.billing_email,
        cbuAlias: f.valores.cbu_alias,
      }))
    ),
};

export function OrganizacionesImportWizard() {
  return <ImportWizard config={config} />;
}
