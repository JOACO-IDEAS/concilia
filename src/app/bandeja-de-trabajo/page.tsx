import { Topbar } from "@/components/layout/Topbar";
import { AtencionRequeridaCard } from "@/components/conciliacion/AtencionRequeridaCard";
import { CobranzaMoraCard } from "@/components/bandeja-de-trabajo/CobranzaMoraCard";
import { obtenerBandejaInconsistencias } from "@/app/conciliacion/payments-actions";
import { obtenerResumenBandejaTrabajo } from "./actions";
import { getOverdueOrganizations } from "@/app/morosidad/actions";

// Datos reales que cambian todo el tiempo — nunca cacheado como estático.
export const dynamic = "force-dynamic";

/**
 * Bandeja de Trabajo — la pantalla principal de ConciliIA. Responde
 * exactamente 3 preguntas y nada más (ver PRODUCT_BLUEPRINT.md):
 *   1. ¿En cuántos pagos identificamos la organización automáticamente?
 *   2. ¿Qué requiere mi atención humana?
 *   3. ¿Qué puedo ejecutar ahora? (cobranza de mora)
 * Sin gráficos, sin widgets, sin métricas adicionales. La carga manual de
 * extractos (PDF/imagen/CSV) sigue disponible en /conciliacion — no es una
 * de las 3 preguntas de esta pantalla, así que no vive acá.
 */
export default async function BandejaDeTrabajoPage() {
  const [bandeja, resumen, mora] = await Promise.all([
    obtenerBandejaInconsistencias(),
    obtenerResumenBandejaTrabajo(),
    getOverdueOrganizations(),
  ]);

  const pendientes = bandeja.ok ? bandeja.items.length : 0;

  return (
    <>
      <Topbar title="Bandeja de Trabajo" subtitle="Tu empleado de IA" />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-4 sm:p-6">
        <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-200">
          {resumen.ok ? (
            <>
              <span className="font-semibold text-slate-900 dark:text-slate-50">
                {resumen.organizacionAutoResuelta}
              </span>{" "}
              pago{resumen.organizacionAutoResuelta === 1 ? "" : "s"} con organización identificada
              automáticamente.
            </>
          ) : null}{" "}
          {pendientes > 0 ? (
            <>
              <span className="font-semibold text-slate-900 dark:text-slate-50">{pendientes}</span>{" "}
              necesita{pendientes === 1 ? "" : "n"} tu aprobación.
            </>
          ) : (
            "Nada necesita tu aprobación ahora."
          )}
        </p>

        <AtencionRequeridaCard datosIniciales={bandeja} />
        <CobranzaMoraCard datosIniciales={mora} />
      </main>
    </>
  );
}
