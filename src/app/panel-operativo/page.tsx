import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import {
  listarOrganizacionesAction,
  marcarObservacionComoAtendidaAction,
  obtenerBandejaDeTrabajoAction,
  obtenerObservacionDetalleAction,
  obtenerObservacionesRelacionadasAction,
  obtenerResumenComplianceDeConsorcioAction,
  obtenerResumenOperativoAction,
} from "./actions";
import type { ObservacionEnBandeja } from "@/lib/agent-os/work-queue";
import type { ObservacionAgentePersistida, AgentType, AgentObservationSeverity, AgentObservationType } from "@/lib/agent-os/types";
import { agruparPorConsorcio, clasificarBandeja, classifyObservation, type InboxCategory, type ObservacionClasificada } from "@/lib/agent-os/inbox-classification";

// Fase 5.1 — ConcilIA OS Inbox. El panel deja de ser "una lista de
// AgentObservation" y pasa a presentar el estado del estudio desde el punto
// de vista del administrador: qué requiere acción, qué requiere una
// decisión, qué es simplemente falta de información, qué es solo contexto,
// qué ya está resuelto — sin que el administrador necesite saber de qué
// agente vino cada cosa. La clasificación (`inbox-classification.ts`) es
// PURA, derivada en cada lectura — cero columna nueva para esto. Sigue
// siendo EVENTO→OBSERVACIÓN→RECOMENDACIÓN TEXTUAL→SUPERVISIÓN HUMANA: la
// única escritura de esta pantalla sigue siendo "marcar como atendida"
// (actions.ts) — sin acciones externas, sin AgentAction, sin ejecución.
export const dynamic = "force-dynamic";

const ETIQUETA_CATEGORIA: Record<InboxCategory, { icono: string; texto: string; subtitulo: string }> = {
  NEEDS_ACTION: { icono: "🔴", texto: "Requiere acción", subtitulo: "No hay ambigüedad sobre qué hacer — falta gestionarlo." },
  NEEDS_DECISION: { icono: "🟡", texto: "Requiere decisión", subtitulo: "Hay evidencia real, pero contradictoria o ambigua — necesita tu criterio." },
  NEEDS_DATA: { icono: "⚪", texto: "Falta información", subtitulo: "ConcilIA no tiene con qué evaluar esto todavía — no es necesariamente un problema." },
  INFORMATIONAL: { icono: "🔵", texto: "Información", subtitulo: "Contexto, sin necesidad de intervenir." },
  RESOLVED: { icono: "🟢", texto: "Resuelto", subtitulo: "Ya fue atendido." },
};

// Explicación GENÉRICA de qué significa cada categoría — no una afirmación
// sobre el caso puntual (eso es `explanation`, real). Nunca inventa un
// hecho específico, solo describe el sistema de clasificación en sí.
const EXPLICACION_CATEGORIA: Record<InboxCategory, { porQueImporta: string; queHacer: string }> = {
  NEEDS_ACTION: {
    porQueImporta: "No hay evidencia vigente para continuar con normalidad — requiere gestionar un trámite concreto.",
    queHacer: "Gestionar la acción correspondiente (ej. solicitar la renovación) antes de que se convierta en un bloqueo real.",
  },
  NEEDS_DECISION: {
    porQueImporta: "ConcilIA encontró evidencia real pero contradictoria o ambigua — ningún candidato es claramente correcto.",
    queHacer: "Revisar la evidencia y elegir manualmente qué corresponde. ConcilIA no puede decidir esto solo.",
  },
  NEEDS_DATA: {
    porQueImporta: "Sin este dato, ConcilIA no puede evaluar la situación con confianza — falta de evidencia no es lo mismo que un incumplimiento.",
    queHacer: "Completar el dato faltante (organización, unidades, documentación). No hay nada más que decidir todavía.",
  },
  INFORMATIONAL: {
    porQueImporta: "Es contexto operativo, no un problema.",
    queHacer: "Nada — es solo para tu conocimiento.",
  },
  RESOLVED: {
    porQueImporta: "Ya fue atendido.",
    queHacer: "Nada — esta observación está cerrada. Si la condición real sigue vigente, ConcilIA la vuelve a abrir sola.",
  },
};

const ETIQUETA_TIPO: Record<string, string> = {
  DOCUMENT_EXPIRED: "Documento vencido",
  DOCUMENT_EXPIRING_SOON: "Documento próximo a vencer",
  PROVIDER_WITHOUT_DOCUMENTS: "Proveedor sin documentación",
  PAYMENT_MATCH_BLOCKED: "Pago bloqueado por el motor de matching",
  PAYMENT_MATCH_AMBIGUOUS: "Pago con más de un candidato posible",
};

// El panel no esconde de qué agente/sistema viene cada observación — cada
// origen tiene su propio ícono, visible en la tarjeta Y en el detalle.
const ETIQUETA_ORIGEN: Record<string, { icono: string; texto: string }> = {
  COMPLIANCE: { icono: "🤖", texto: "Agente de Compliance" },
  MATCHING: { icono: "🏦", texto: "Motor de Matching" },
};

const ETIQUETA_SEVERIDAD: Record<string, string> = { CRITICAL: "Crítica", WARNING: "Advertencia", INFO: "Informativa" };

const ETIQUETA_EVIDENCIA: Record<string, string> = {
  type: "Tipo de documento",
  validTo: "Vencimiento",
  documentId: "ID de documento",
  providerName: "Proveedor",
  diasParaVencer: "Días para vencer",
  organizationIds: "Organizaciones vinculadas (ids)",
  providerId: "ID de proveedor",
  paymentTransactionId: "ID de pago",
  amount: "Importe",
  transactionDate: "Fecha del movimiento",
  referenceNumber: "Referencia",
  concept: "Concepto",
  status: "Estado del matching",
  blockers: "Motivo del bloqueo/ambigüedad",
  topCandidateScore: "Score del mejor candidato evaluado",
  topCandidateTier: "Tier del mejor candidato evaluado",
  engineVersion: "Versión del motor",
  evaluatedAt: "Evaluado",
};

// `topCandidates` se muestra en un bloque dedicado ("Posibles unidades"),
// no en la lista genérica de evidencia — se excluye acá para no duplicar.
const CLAVES_EVIDENCIA_CON_BLOQUE_PROPIO = new Set(["topCandidates"]);

function formatearFecha(valor: unknown): string {
  if (typeof valor !== "string") return "—";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatearMonto(valor: number): string {
  return `$${valor.toLocaleString("es-AR")}`;
}

function formatearValorEvidencia(clave: string, valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  if (clave === "validTo" || clave === "transactionDate" || clave === "evaluatedAt") return formatearFecha(valor);
  if (clave === "amount" && typeof valor === "number") return formatearMonto(valor);
  if (clave === "topCandidateScore" && typeof valor === "number") return `${valor}%`;
  if (clave === "topCandidateTier" && typeof valor === "number") return `Tier ${valor}`;
  if (clave === "blockers" && Array.isArray(valor)) {
    if (valor.length === 0) return "ninguno";
    return valor.map((b) => (b && typeof b === "object" && "evidence" in b ? String((b as { evidence: unknown }).evidence) : String(b))).join("; ");
  }
  if (Array.isArray(valor)) return valor.length > 0 ? valor.join(", ") : "—";
  return String(valor);
}

interface TopCandidatoEvidencia {
  unitCode: string;
  score: number;
  tier: number | null;
  matchedSignals: string[];
}

function extraerTopCandidates(evidence: Record<string, unknown>): TopCandidatoEvidencia[] | null {
  const valor = evidence.topCandidates;
  return Array.isArray(valor) && valor.length > 0 ? (valor as TopCandidatoEvidencia[]) : null;
}

function extraerQueFalta(evidence: Record<string, unknown>): string | null {
  const blockers = evidence.blockers;
  if (!Array.isArray(blockers) || blockers.length === 0) return null;
  const primero = blockers[0] as { evidence?: unknown };
  return typeof primero?.evidence === "string" ? primero.evidence : null;
}

// Fase 5.2 — mejora 4: sub-causa real de NEEDS_DATA, derivada de
// `evidence.blockers[0].type` (ya persistido, nunca recalculado) — evita
// que 42 tarjetas ⚪ se vean idénticas cuando en realidad son 3 causas raíz
// distintas (Fase 5.2, Parte 1). Cero clasificación nueva: es presentación,
// la categoría sigue siendo NEEDS_DATA para las tres.
function extraerSubCausaNeedsData(o: { type: string; organizationId: string | null; evidence: Record<string, unknown> }): string | null {
  if (o.type === "PROVIDER_WITHOUT_DOCUMENTS") return "Proveedor sin ningún documento cargado";

  const blockers = o.evidence.blockers;
  const primero = Array.isArray(blockers) && blockers[0] && typeof blockers[0] === "object" ? (blockers[0] as { type?: unknown }) : null;
  const tipoBlocker = typeof primero?.type === "string" ? primero.type : null;

  if (tipoBlocker === "NO_UNITS_IN_ORGANIZATION") return "Consorcio sin unidades cargadas";
  if (tipoBlocker === "INSUFFICIENT_EVIDENCE") {
    return o.organizationId ? "Datos bancarios insuficientes para identificar el pago" : "Pago sin organización resuelta todavía";
  }
  return null;
}

const OPCIONES_CATEGORIA: InboxCategory[] = ["NEEDS_ACTION", "NEEDS_DECISION", "NEEDS_DATA", "INFORMATIONAL", "RESOLVED"];
const OPCIONES_ORIGEN: AgentType[] = ["COMPLIANCE", "MATCHING"];
const OPCIONES_SEVERIDAD: AgentObservationSeverity[] = ["CRITICAL", "WARNING", "INFO"];
const OPCIONES_TIPO: AgentObservationType[] = [
  "DOCUMENT_EXPIRED",
  "DOCUMENT_EXPIRING_SOON",
  "PROVIDER_WITHOUT_DOCUMENTS",
  "PAYMENT_MATCH_BLOCKED",
  "PAYMENT_MATCH_AMBIGUOUS",
];

export default async function PanelOperativoPage({
  searchParams,
}: {
  searchParams: Promise<{ organizacion?: string; detalle?: string; categoria?: string; origen?: string; severidad?: string; tipo?: string }>;
}) {
  const { organizacion, detalle, categoria, origen, severidad, tipo } = await searchParams;

  let bandeja: Awaited<ReturnType<typeof obtenerBandejaDeTrabajoAction>> | null = null;
  let organizaciones: Awaited<ReturnType<typeof listarOrganizacionesAction>> = [];
  let resumen: Awaited<ReturnType<typeof obtenerResumenOperativoAction>> | null = null;
  let resumenCompliance: Awaited<ReturnType<typeof obtenerResumenComplianceDeConsorcioAction>> | null = null;
  let observacionDetalle: ObservacionAgentePersistida | null = null;
  let relacionadas: ObservacionEnBandeja[] = [];
  let tablaNoDisponible = false;

  try {
    [bandeja, organizaciones, resumen] = await Promise.all([
      obtenerBandejaDeTrabajoAction(organizacion || undefined),
      listarOrganizacionesAction(),
      obtenerResumenOperativoAction(organizacion || undefined),
    ]);
    // Fase 5.2 — mejora 2: solo se consulta cuando hay UN consorcio en foco
    // (evita N consultas en la vista "todos los consorcios").
    if (organizacion) resumenCompliance = await obtenerResumenComplianceDeConsorcioAction(organizacion);
    if (detalle) {
      [observacionDetalle, relacionadas] = await Promise.all([obtenerObservacionDetalleAction(detalle), obtenerObservacionesRelacionadasAction(detalle)]);
    }
  } catch (e) {
    console.error("[panel-operativo] agent_observations no disponible todavía en esta base:", e);
    tablaNoDisponible = true;
  }

  if (tablaNoDisponible || !bandeja || !resumen) {
    return (
      <>
        <Topbar title="ConcilIA OS" subtitle="Inbox" />
        <main className="flex-1 p-4 sm:p-6">
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Esta capacidad todavía no está desplegada en esta base de datos — la migración de{" "}
            <code>AgentObservation</code> se aplicó únicamente en el entorno de prueba <code>dev-fixtures</code>,
            no en producción. Ver <code>scripts/fase-4-agent-os/</code> para una demostración funcional.
          </p>
        </main>
      </>
    );
  }

  if (detalle) {
    return (
      <>
        <Topbar title="ConcilIA OS" subtitle="Detalle" />
        <main className="flex-1 space-y-4 p-4 sm:p-6">
          <Link
            href={organizacion ? `/panel-operativo?organizacion=${organizacion}` : "/panel-operativo"}
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            ← Volver al inbox
          </Link>

          {!observacionDetalle ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No se encontró esa observación.</p>
          ) : (
            <DetalleObservacion observacion={observacionDetalle} organizacion={organizacion} relacionadas={relacionadas} />
          )}
        </main>
      </>
    );
  }

  // Fase 5.1 §3 — clasificación derivada en READ TIME, sobre TODAS las
  // observaciones (abiertas + resueltas). Los filtros de origen/severidad/
  // tipo se aplican ANTES de clasificar, para que los conteos del resumen y
  // de cada sección reflejen exactamente lo filtrado.
  const todas = [...bandeja.observacionesAbiertas, ...bandeja.observacionesResueltas];
  const filtradas = todas.filter(
    (o) => (!origen || o.agentType === origen) && (!severidad || o.severity === severidad) && (!tipo || o.type === tipo)
  );
  const clasificadas = clasificarBandeja(filtradas);
  const porConsorcio = organizacion ? [] : agruparPorConsorcio(clasificadas);

  const sinDatosGlobal = todas.length === 0;
  const categoriasAMostrar = categoria && OPCIONES_CATEGORIA.includes(categoria as InboxCategory) ? [categoria as InboxCategory] : OPCIONES_CATEGORIA;

  const observacionesMatchingAbiertas = filtradas.filter((o) => o.agentType === "MATCHING" && o.status === "OPEN").length;
  const pagosSinIntervencion = Math.max(0, resumen.pagosAnalizados - observacionesMatchingAbiertas);

  return (
    <>
      <Topbar title="ConcilIA OS" subtitle="Esto es lo que necesita tu atención hoy" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <form method="GET" className="flex flex-wrap items-center gap-2 text-sm">
          <FiltroSelect nombre="organizacion" etiqueta="Consorcio" valorActual={organizacion}>
            <option value="">Todos los consorcios</option>
            {organizaciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </FiltroSelect>
          <FiltroSelect nombre="categoria" etiqueta="Categoría" valorActual={categoria}>
            <option value="">Todas</option>
            {OPCIONES_CATEGORIA.map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CATEGORIA[c].icono} {ETIQUETA_CATEGORIA[c].texto}
              </option>
            ))}
          </FiltroSelect>
          <FiltroSelect nombre="origen" etiqueta="Origen" valorActual={origen}>
            <option value="">Todos</option>
            {OPCIONES_ORIGEN.map((a) => (
              <option key={a} value={a}>
                {ETIQUETA_ORIGEN[a].icono} {ETIQUETA_ORIGEN[a].texto}
              </option>
            ))}
          </FiltroSelect>
          <FiltroSelect nombre="severidad" etiqueta="Severidad" valorActual={severidad}>
            <option value="">Todas</option>
            {OPCIONES_SEVERIDAD.map((s) => (
              <option key={s} value={s}>
                {ETIQUETA_SEVERIDAD[s]}
              </option>
            ))}
          </FiltroSelect>
          <FiltroSelect nombre="tipo" etiqueta="Tipo" valorActual={tipo}>
            <option value="">Todos</option>
            {OPCIONES_TIPO.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO[t]}
              </option>
            ))}
          </FiltroSelect>
          <button type="submit" className="rounded-lg bg-slate-900 px-3 py-1 text-white dark:bg-slate-100 dark:text-slate-900">
            Filtrar
          </button>
        </form>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {OPCIONES_CATEGORIA.map((c) => (
            <TarjetaResumenCategoria key={c} categoria={c} cantidad={clasificadas[c].length} />
          ))}
        </section>

        <ConciliaEstaTrabajando resumen={resumen} sinIntervencion={pagosSinIntervencion} clasificadas={clasificadas} />

        {porConsorcio.length > 0 ? <ResumenPorConsorcio filas={porConsorcio} /> : null}

        {resumenCompliance ? <ResumenComplianceConsorcio resumen={resumenCompliance} /> : null}

        {sinDatosGlobal ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Todavía no hay pagos ni documentación cargados para este filtro — este inbox está honestamente vacío. Ver{" "}
            <code>scripts/fase-4-agent-os/</code> para una demostración con datos de prueba.
          </p>
        ) : (
          categoriasAMostrar.map((c) => (
            <SeccionCategoria key={c} categoria={c} observaciones={clasificadas[c]} organizacion={organizacion} />
          ))
        )}
      </main>
    </>
  );
}

function FiltroSelect({
  nombre,
  etiqueta,
  valorActual,
  children,
}: {
  nombre: string;
  etiqueta: string;
  valorActual?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
      {etiqueta}:
      <select
        name={nombre}
        defaultValue={valorActual ?? ""}
        className="rounded-lg border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
      >
        {children}
      </select>
    </label>
  );
}

function TarjetaResumenCategoria({ categoria, cantidad }: { categoria: InboxCategory; cantidad: number }) {
  const et = ETIQUETA_CATEGORIA[categoria];
  return (
    <Link
      href={`/panel-operativo?categoria=${categoria}`}
      className="block rounded-lg border border-slate-200 bg-white p-3 text-center hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
    >
      <p className="text-xl">{et.icono}</p>
      <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{cantidad}</p>
      <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">{et.texto}</p>
    </Link>
  );
}

// Fase 5.1 §16 — "ConcilIA está trabajando": solo métricas reales, ya
// calculadas por resumen-operativo.ts (pagos/documentos) y por la propia
// clasificación de esta página (conteos por categoría). Sin animaciones,
// sin "agentes trabajando" ficticios — la inteligencia se demuestra con
// resultados, no con adornos.
function ConciliaEstaTrabajando({
  resumen,
  sinIntervencion,
  clasificadas,
}: {
  resumen: Awaited<ReturnType<typeof obtenerResumenOperativoAction>>;
  sinIntervencion: number;
  clasificadas: Record<InboxCategory, ObservacionClasificada[]>;
}) {
  const sinDatos = resumen.pagosAnalizados === 0 && resumen.documentosRevisados === 0;
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="font-semibold text-slate-700 dark:text-slate-300">ConcilIA está trabajando</p>
      {sinDatos ? (
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          Todavía no hay pagos ni documentación cargados para este filtro — ConcilIA no tiene nada que resumir.
        </p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-400">
          <li>
            🏦 ConcilIA analizó {resumen.pagosAnalizados} pago{resumen.pagosAnalizados === 1 ? "" : "s"} — {sinIntervencion} sin novedad,{" "}
            {resumen.pagosAnalizados - sinIntervencion} requiere{resumen.pagosAnalizados - sinIntervencion === 1 ? "" : "n"} revisión.
          </li>
          <li>
            📄 ConcilIA revisó {resumen.documentosRevisados} documento{resumen.documentosRevisados === 1 ? "" : "s"} de proveedores.
          </li>
          <li>
            {ETIQUETA_CATEGORIA.NEEDS_ACTION.icono} {clasificadas.NEEDS_ACTION.length} situación(es) requieren acción ·{" "}
            {ETIQUETA_CATEGORIA.NEEDS_DECISION.icono} {clasificadas.NEEDS_DECISION.length} decisión(es) pendientes ·{" "}
            {ETIQUETA_CATEGORIA.NEEDS_DATA.icono} {clasificadas.NEEDS_DATA.length} caso(s) con información incompleta.
          </li>
        </ul>
      )}
    </section>
  );
}

// Fase 5.1 §15 — agrupación derivada por consorcio, nunca una entidad
// nueva. Solo se muestra viendo "todos los consorcios" (con un filtro de
// organización activo, ya está implícitamente agrupado por esa única org).
function ResumenPorConsorcio({ filas }: { filas: ReturnType<typeof agruparPorConsorcio> }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
      <p className="font-semibold text-slate-700 dark:text-slate-300">Por consorcio</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {filas.map((f) => (
          <Link
            key={f.organizationId}
            href={`/panel-operativo?organizacion=${f.organizationId}`}
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
          >
            <p className="font-medium text-slate-800 dark:text-slate-200">{f.organizationName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              🔴 {f.requierenAccion} acción · 🟡 {f.requierenDecision} decisión · ⚪ {f.faltaInformacion} dato{f.faltaInformacion === 1 ? "" : "s"}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

// Fase 5.2 — mejora 2: "Consorcio X: N documentos, 1 vencido, 2 próximos a
// vencer, N observaciones abiertas" — 100% derivado, ver compliance-summary.ts.
function ResumenComplianceConsorcio({ resumen }: { resumen: Awaited<ReturnType<typeof obtenerResumenComplianceDeConsorcioAction>> }) {
  const totalDocumentos = resumen.documentosVigentes + resumen.documentosPorVencer + resumen.documentosVencidos + resumen.documentosSinVencimiento;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
      <p className="font-semibold text-slate-700 dark:text-slate-300">Compliance de este consorcio</p>
      {totalDocumentos === 0 ? (
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          Todavía no hay documentación de proveedores cargada para este consorcio — estado honestamente vacío.
        </p>
      ) : (
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          {totalDocumentos} documento{totalDocumentos === 1 ? "" : "s"}
          {resumen.documentosVencidos > 0 ? ` — 🔴 ${resumen.documentosVencidos} vencido${resumen.documentosVencidos === 1 ? "" : "s"}` : ""}
          {resumen.documentosPorVencer > 0 ? ` — 🟡 ${resumen.documentosPorVencer} próximo${resumen.documentosPorVencer === 1 ? "" : "s"} a vencer` : ""}
          {" — "}
          {resumen.observacionesAbiertas} observación{resumen.observacionesAbiertas === 1 ? "" : "es"} de compliance abierta
          {resumen.observacionesAbiertas === 1 ? "" : "s"}.
        </p>
      )}
    </section>
  );
}

function SeccionCategoria({
  categoria,
  observaciones,
  organizacion,
}: {
  categoria: InboxCategory;
  observaciones: ObservacionClasificada[];
  organizacion?: string;
}) {
  const et = ETIQUETA_CATEGORIA[categoria];
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
          {et.icono} {et.texto.toUpperCase()}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">{et.subtitulo}</p>
      </div>
      {observaciones.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Nada en esta categoría por ahora.</p>
      ) : (
        <div className="space-y-2">
          {observaciones.map((obs) => (
            <TarjetaObservacion key={obs.id} observacion={obs} organizacion={organizacion} />
          ))}
        </div>
      )}
    </section>
  );
}

function TarjetaObservacion({ observacion, organizacion }: { observacion: ObservacionClasificada; organizacion?: string }) {
  const origen = ETIQUETA_ORIGEN[observacion.agentType] ?? { icono: "⚪", texto: observacion.agentType };
  const href = `/panel-operativo?detalle=${observacion.id}${organizacion ? `&organizacion=${organizacion}` : ""}`;
  const subCausa = observacion.categoria === "NEEDS_DATA" ? extraerSubCausaNeedsData(observacion) : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
        {origen.icono} {origen.texto}
      </p>
      <p className="font-semibold text-slate-900 dark:text-slate-100">
        {ETIQUETA_TIPO[observacion.type] ?? observacion.type}
        {observacion.providerName ? ` de ${observacion.providerName}` : ""}
      </p>
      {subCausa ? <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{subCausa}</p> : null}
      {observacion.organizationNames.length > 0 ? (
        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
          Consorcio{observacion.organizationNames.length > 1 ? "s" : ""}: {observacion.organizationNames.join(", ")}
        </p>
      ) : null}
      <p className="mt-1 text-slate-700 dark:text-slate-300">{observacion.explanation}</p>
      {observacion.suggestedAction ? (
        <p className="mt-1 text-slate-500 dark:text-slate-400">🤖 ConcilIA propone: {observacion.suggestedAction}</p>
      ) : null}
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">ConcilIA no ejecuta esto — vos decidís.</p>
        <Link href={href} className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
          Ver detalle →
        </Link>
      </div>
    </div>
  );
}

function DetalleObservacion({
  observacion,
  organizacion,
  relacionadas,
}: {
  observacion: ObservacionAgentePersistida;
  organizacion?: string;
  relacionadas: ObservacionEnBandeja[];
}) {
  const categoria = classifyObservation(observacion);
  const et = ETIQUETA_CATEGORIA[categoria];
  const explicacion = EXPLICACION_CATEGORIA[categoria];
  const origen = ETIQUETA_ORIGEN[observacion.agentType] ?? { icono: "⚪", texto: observacion.agentType };
  const fuente = observacion.paymentTransactionId
    ? "PaymentTransaction (vía ShadowMatchLog)"
    : observacion.providerDocumentId
      ? "ProviderDocument"
      : observacion.providerId
        ? "Provider"
        : "—";
  const topCandidates = extraerTopCandidates(observacion.evidence);
  const queFalta = categoria === "NEEDS_DATA" ? extraerQueFalta(observacion.evidence) : null;
  const subCausa = categoria === "NEEDS_DATA" ? extraerSubCausaNeedsData(observacion) : null;

  return (
    <div className="max-w-2xl space-y-4 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
      <div>
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
          {origen.icono} {origen.texto} · {et.icono} {et.texto}
        </p>
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{ETIQUETA_TIPO[observacion.type] ?? observacion.type}</h1>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Qué pasó</p>
        <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{observacion.explanation}</p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Por qué importa</p>
        <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{explicacion.porQueImporta}</p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Evidencia</p>
        <ul className="mt-1 space-y-0.5 text-sm text-slate-700 dark:text-slate-300">
          {Object.entries(observacion.evidence)
            .filter(([clave]) => !CLAVES_EVIDENCIA_CON_BLOQUE_PROPIO.has(clave))
            .map(([clave, valor]) => (
              <li key={clave}>
                — {ETIQUETA_EVIDENCIA[clave] ?? clave}: {formatearValorEvidencia(clave, valor)}
              </li>
            ))}
          <li>— Fecha de detección: {formatearFecha(observacion.detectedAt)}</li>
        </ul>
      </div>

      {/* Fase 5.1 §10/4.G — candidatos reales de un AMBIGUOUS/BLOCKED, con
          identidad (UF), nunca inventados: vienen de ShadowMatchLog.topCandidates,
          poblado por el motor de matching sin recalcular nada. */}
      {topCandidates ? (
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Posibles unidades</p>
          <ul className="mt-1 space-y-1 text-sm text-slate-700 dark:text-slate-300">
            {topCandidates.map((c) => (
              <li key={c.unitCode}>
                — UF {c.unitCode} — score {c.score}
                {c.tier ? ` (tier ${c.tier})` : ""}
                {c.matchedSignals.length > 0 ? ` — señales: ${c.matchedSignals.join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {queFalta ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Qué información falta</p>
          {subCausa ? <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">{subCausa}</p> : null}
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{queFalta}</p>
          {/* Fase 5.2 — mejora 3: enlace de navegación, nunca una escritura —
              el importador de unidades ya existe (/unidades-config), esto solo
              lleva ahí, sin pre-seleccionar el consorcio (esa pantalla no
              soporta deep-link todavía, no se inventa esa capacidad). */}
          {subCausa === "Consorcio sin unidades cargadas" ? (
            <p className="mt-2">
              <Link href="/unidades-config" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
                Importar unidades de este consorcio →
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {observacion.suggestedAction ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
          <p className="text-xs font-semibold uppercase text-blue-600 dark:text-blue-400">🤖 ConcilIA propone</p>
          <p className="mt-1 text-sm text-blue-900 dark:text-blue-200">{observacion.suggestedAction}</p>
        </div>
      ) : null}

      <div>
        <p className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Qué debería hacer el administrador</p>
        <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{explicacion.queHacer}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Fuente</p>
          <p className="text-slate-700 dark:text-slate-300">{fuente}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Detectado por</p>
          <p className="text-slate-700 dark:text-slate-300">{origen.texto}</p>
        </div>
      </div>

      {/* Fase 4.F §7/§9 — cruce de contexto: otras observaciones ABIERTAS
          que comparten organización real con esta (nunca por proveedor/pago
          específico — esa relación no existe en el modelo). */}
      <div>
        <p className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Otras observaciones abiertas de este consorcio</p>
        {relacionadas.length === 0 ? (
          <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
            No hay otras observaciones abiertas en el/los mismo(s) consorcio(s) — o esta observación no tiene un consorcio real resuelto todavía.
          </p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {relacionadas.map((r) => {
              const origenR = ETIQUETA_ORIGEN[r.agentType] ?? { icono: "⚪", texto: r.agentType };
              const catR = ETIQUETA_CATEGORIA[classifyObservation(r)];
              return (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="text-slate-700 dark:text-slate-300">
                    {origenR.icono} {catR.icono} {ETIQUETA_TIPO[r.type] ?? r.type}
                    {r.providerName ? ` — ${r.providerName}` : ""}
                  </span>
                  <Link
                    href={`/panel-operativo?detalle=${r.id}${organizacion ? `&organizacion=${organizacion}` : ""}`}
                    className="shrink-0 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Ver →
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">ConcilIA observa, explica y propone. La decisión sigue siendo tuya — nada se ejecuta solo.</p>

      {observacion.status === "OPEN" ? (
        <form action={marcarObservacionComoAtendidaAction} className="pt-2">
          <input type="hidden" name="id" value={observacion.id} />
          {organizacion ? <input type="hidden" name="organizacion" value={organizacion} /> : null}
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            Marcar como atendida
          </button>
        </form>
      ) : (
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">🟢 Ya atendida.</p>
      )}
    </div>
  );
}
