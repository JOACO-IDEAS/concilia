"use client";

import { useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { ImportWizard } from "@/components/import/ImportWizard";
import { importarUnidades, type OrganizacionOpcionDTO } from "@/app/unidades-config/actions";
import { CAMPOS_DESTINO_UNIDADES } from "@/lib/import/unit-fields";
import type { FilaImportacion, ImportWizardConfig } from "@/lib/import/types";
import { sugerirMapeoUnidades, validarFilaUnidad } from "@/lib/import/validation";

// Un archivo de padrón es siempre de UN consorcio a la vez (ver nota en
// unit-fields.ts) — por eso acá, a diferencia de OrganizacionesImportWizard,
// hace falta un paso previo de selección antes de que exista la config que
// necesita `ImportWizard` (la Server Action de importación recibe el
// organizationId elegido, no viene fila por fila).
export function UnidadesImportWizard({
  organizaciones,
}: {
  organizaciones: OrganizacionOpcionDTO[];
}) {
  const [organizationId, setOrganizationId] = useState(organizaciones[0]?.id ?? "");

  const config: ImportWizardConfig | null = useMemo(() => {
    if (!organizationId) return null;
    return {
      tituloUpload: "Importar unidades y titulares desde Excel o CSV",
      subtituloUpload:
        "Subí el padrón de un consorcio y te ayudamos a mapear las columnas antes de cargarlo",
      camposDestino: CAMPOS_DESTINO_UNIDADES,
      sugerirMapeo: sugerirMapeoUnidades,
      validarFila: validarFilaUnidad,
      entidadPlural: "unidades",
      notaActualizacion:
        "Las unidades que ya existan (mismo código) se actualizan; los titulares se identifican por CUIT cuando está disponible.",
      linkResultado: { href: "/unidades-config", label: "Ver unidades" },
      confirmar: (filas: FilaImportacion[]) =>
        importarUnidades(
          organizationId,
          filas.map((f) => ({
            unitCode: f.valores.unit_code,
            ownerFullName: f.valores.owner_full_name,
            ownerTaxId: f.valores.owner_tax_id,
            ownerRelationship: f.valores.owner_relationship,
            ownerEmail: f.valores.owner_email,
            ownerPhone: f.valores.owner_phone,
            coefficient: f.valores.coefficient,
          }))
        ),
    };
  }, [organizationId]);

  if (organizaciones.length === 0) {
    return (
      <Card className="animate-fade-in-up">
        <CardHeader title="Importar unidades y titulares" />
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <Building2 size={26} className="text-slate-300 dark:text-slate-700" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Todavía no hay ninguna organización cargada — importala primero desde /importar.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="animate-fade-in-up">
        <CardHeader
          title="¿Para qué consorcio es este padrón?"
          subtitle="El archivo que subas a continuación se va a cargar únicamente en este consorcio"
        />
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <select
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 sm:flex-none sm:min-w-[16rem]"
          >
            {organizaciones.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {config ? (
        <ImportWizard key={organizationId} config={config} />
      ) : null}
    </div>
  );
}
