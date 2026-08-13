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
export default function RevisionHumanaPage() {
  // La resolución se consolidó en Inicio → Workspace. Se conserva la URL
  // para enlaces existentes, pero no se mantiene una segunda UX paralela.
  redirect("/");
}
