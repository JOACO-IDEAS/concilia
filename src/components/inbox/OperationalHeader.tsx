"use client";

import { useCurrentAdministrator } from "@/lib/auth/current-administrator-context";
import { organizationLabel } from "@/components/layout/Topbar";
import { formatFullDate } from "@/lib/format";

/** Encabezado contextual de Inicio — nunca un `<h1>` (el Topbar ya define el
 * único `<h1>` de la página, "Inicio"). Identidad y organización vienen del
 * mismo contexto que ya usa el Topbar (UX-2, `RootLayout` →
 * `requireCurrentAdministrator()`), sin ninguna consulta adicional. Si no
 * hay identidad resuelta, el saludo es neutral — nunca un nombre inventado. */
export function OperationalHeader() {
  const { administrator, organizations } = useCurrentAdministrator();
  const firstName = administrator?.name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hola, ${firstName}` : "Hola";
  const orgLabel = organizationLabel(organizations);
  const today = formatFullDate(new Date());

  return (
    <section className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{today}</p>
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">{greeting}</h2>
      {orgLabel ? <p className="text-sm text-slate-600 dark:text-slate-300">{orgLabel}</p> : null}
    </section>
  );
}
