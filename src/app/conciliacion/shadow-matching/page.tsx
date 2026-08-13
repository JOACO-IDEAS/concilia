import { Topbar } from "@/components/layout/Topbar";
import { obtenerMetricasShadowAction, obtenerResultadoShadowAction } from "../shadow-matching-actions";

// Pantalla técnica mínima, READ-ONLY — Fase 3.6, Parte 1. No hay ningún
// botón de aprobar/rechazar/conciliar acá, a propósito: el motor sigue en
// modo sombra, esto solo permite INSPECCIONAR lo que ya calculó y persistió
// en ShadowMatchLog. Sin gráficos ni componentes nuevos — números y texto
// plano, tal como pidió el pedido ("no necesito diseño visual sofisticado").
//
// Los resultados dependen de lo que haya en ShadowMatchLog en el momento de
// cada request — no debe quedar prerenderizada como estática.
export const dynamic = "force-dynamic";

export default async function ShadowMatchingPage({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string }>;
}) {
  const { pago } = await searchParams;
  const pagoId = pago?.trim() ?? "";

  const [metricas, resultado] = await Promise.all([
    obtenerMetricasShadowAction(),
    pagoId ? obtenerResultadoShadowAction(pagoId) : Promise.resolve(null),
  ]);

  return (
    <>
      <Topbar
        title="Matching en modo sombra — Observabilidad técnica"
        subtitle="Solo lectura — el motor sigue en modo sombra, nada de esto concilia nada"
      />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Métricas agregadas</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Estadistica etiqueta="Total evaluados" valor={metricas.totalEvaluados} />
            <Estadistica etiqueta="CANDIDATE" valor={metricas.porStatus.CANDIDATE} />
            <Estadistica etiqueta="AMBIGUOUS" valor={metricas.porStatus.AMBIGUOUS} />
            <Estadistica etiqueta="BLOCKED" valor={metricas.porStatus.BLOCKED} />
            <Estadistica etiqueta="Sin evidencia" valor={metricas.sinEvidencia} />
            <Estadistica etiqueta="Confianza promedio" valor={`${metricas.confianzaPromedio.toFixed(1)}%`} />
            <Estadistica etiqueta="BLOCKED sin candidato evaluado" valor={metricas.blockedSinCandidatoEvaluado} />
          </div>
        </section>

        <TablaSimple
          titulo="BLOCKED — score del mejor candidato (diagnóstico, Fase 3.9)"
          filas={metricas.distribucionTopCandidateScoreBlocked.map((d) => [d.rango, d.cantidad] as [string, number])}
          columnaClave="Rango"
        />

        <TablaSimple
          titulo="Distribución por tier"
          filas={Object.entries(metricas.distribucionTier).sort(([a], [b]) => a.localeCompare(b))}
          columnaClave="Tier"
        />

        <TablaSimple
          titulo="Distribución por versión del motor"
          filas={Object.entries(metricas.porEngineVersion).sort(([a], [b]) => a.localeCompare(b))}
          columnaClave="engineVersion"
        />

        <TablaSimple
          titulo="Bloqueos más frecuentes"
          filas={Object.entries(metricas.bloqueosFrecuentes).sort(([, a], [, b]) => b - a)}
          columnaClave="Bloqueo"
        />

        <TablaSimple
          titulo="Señales más frecuentes"
          filas={Object.entries(metricas.senalesFrecuentes).sort(([, a], [, b]) => b - a)}
          columnaClave="Señal"
        />

        <TablaSimple
          titulo="Distribución de score (buckets de 10)"
          filas={metricas.distribucionScore.map((d) => [d.rango, d.cantidad] as [string, number])}
          columnaClave="Rango"
        />

        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Inspeccionar un PaymentTransaction puntual
          </h2>
          <form method="GET" className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              name="pago"
              defaultValue={pagoId}
              placeholder="paymentTransactionId"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
            >
              Buscar
            </button>
          </form>

          {pagoId ? (
            <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              {resultado ?? `Sin evaluación shadow registrada para "${pagoId}" (con la versión de motor consultada).`}
            </pre>
          ) : null}
        </section>
      </main>
    </>
  );
}

function Estadistica({ etiqueta, valor }: { etiqueta: string; valor: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs text-slate-500 dark:text-slate-400">{etiqueta}</p>
      <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{valor}</p>
    </div>
  );
}

function TablaSimple({
  titulo,
  filas,
  columnaClave,
}: {
  titulo: string;
  filas: [string, number][];
  columnaClave: string;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">{titulo}</h2>
      {filas.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Sin datos todavía.</p>
      ) : (
        <table className="w-full max-w-md text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="py-1 font-medium">{columnaClave}</th>
              <th className="py-1 font-medium">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(([clave, cantidad]) => (
              <tr key={clave} className="border-b border-slate-100 dark:border-slate-900">
                <td className="py-1 text-slate-800 dark:text-slate-200">{clave}</td>
                <td className="py-1 text-slate-800 dark:text-slate-200">{cantidad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
