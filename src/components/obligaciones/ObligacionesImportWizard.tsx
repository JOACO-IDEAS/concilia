"use client";

import { useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { ImportWizard } from "@/components/import/ImportWizard";
import { importarObligaciones } from "@/app/unidades-config/obligaciones-actions";
import type { OrganizacionOpcionDTO } from "@/app/unidades-config/actions";
import { CAMPOS_DESTINO_OBLIGACIONES } from "@/lib/import/obligation-fields";
import type { FilaImportacion, ImportWizardConfig } from "@/lib/import/types";
import { sugerirMapeoObligaciones, validarFilaObligacion } from "@/lib/import/validation";

// Mismo criterio que UnidadesImportWizard: un archivo de obligaciones es
// siempre de UN consorcio a la vez, elegido antes de que exista la config
// que necesita ImportWizard.
export function ObligacionesImportWizard({
  organizaciones,
}: {
  organizaciones: OrganizacionOpcionDTO[];
}) {
  const [organizationId, setOrganizationId] = useState(organizaciones[0]?.id ?? "");

  const config: ImportWizardConfig | null = useMemo(() => {
    if (!organizationId) return null;
    return {
      tituloUpload: "Importar obligaciones desde Excel o CSV",
      subtituloUpload:
        "Subí la liquidación de expensas de un consorcio y te ayudamos a mapear las columnas antes de cargarla",
      camposDestino: CAMPOS_DESTINO_OBLIGACIONES,
      sugerirMapeo: sugerirMapeoObligaciones,
      validarFila: validarFilaObligacion,
      entidadPlural: "obligaciones",
      notaActualizacion:
        "Las obligaciones que ya existan (misma unidad y período) se actualizan; el código de unidad debe existir previamente.",
      linkResultado: { href: "/obligaciones", label: "Ver obligaciones" },
      confirmar: (filas: FilaImportacion[]) =>
        importarObligaciones(
          organizationId,
          filas.map((f) => ({
            unitCode: f.valores.unit_code,
            period: f.valores.period,
            amount: f.valores.amount,
            concept: f.valores.concept,
            dueDate: f.valores.due_date,
          }))
        ),
    };
  }, [organizationId]);

  if (organizaciones.length === 0) {
    return (
      <Card className="animate-fade-in-up">
        <CardHeader title="Importar obligaciones" />
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
          title="¿Para qué consorcio es esta liquidación?"
          subtitle="El archivo que subas a continuación se va a cargar únicamente en este consorcio — las unidades deben existir previamente"
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

      {config ? <ImportWizard key={organizationId} config={config} /> : null}
    </div>
  );
}
