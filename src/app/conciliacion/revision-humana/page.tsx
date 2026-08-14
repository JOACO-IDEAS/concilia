import { redirect } from "next/navigation";

// Fase 5.12 — bandeja de revisión humana real, Capa 2 (motor de unidad).
// Cierra el loop: motor → sugerencia → humano → decisión real → ORGANIC →
// dataset de calibración (Fase 5.10/5.11). Ninguna acción de esta pantalla
// aplica nada contable — ver human-review-actions.ts.
//
// Fase 5.13 — agrega la segunda sección: casos ambiguos (varios candidatos
// reales, sin ganador claro) con selector multi-candidato — camino
// estructuralmente separado de los casos de candidato único de arriba,
// nunca mezclados (ver review-queue.ts).
// UX-2 — ruta canónica única de Human Review: Conciliación (lista real de
// casos que requieren atención) → Resolution Workspace por caso puntual
// (/conciliacion/resolver/[id]). Esta URL histórica se conserva solo para no
// romper enlaces/bookmarks existentes, redirigiendo a la lista real en vez
// de a Inicio — no se modifica ninguna lógica de revisión.
export default function RevisionHumanaPage() {
  redirect("/conciliacion");
}
