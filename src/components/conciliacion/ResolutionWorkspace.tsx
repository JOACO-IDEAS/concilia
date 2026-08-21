import Link from "next/link";
import {
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Inbox,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime, formatMonto } from "@/lib/format";
import { ResolutionActions } from "./ResolutionActions";
import { EvidenceList } from "./EvidenceList";
import { FinancialIntelligencePanel } from "./FinancialIntelligencePanel";
import type { ResolutionWorkspaceData } from "@/app/conciliacion/resolver/resolution-workspace-data";

const historyIcon: Record<ResolutionWorkspaceData["history"][number]["kind"], typeof Inbox> = {
  RECEIVED: Inbox,
  PROPOSED: Sparkles,
  APPROVED: ThumbsUp,
  REJECTED: ThumbsDown,
};

const historyTone: Record<ResolutionWorkspaceData["history"][number]["kind"], string> = {
  RECEIVED: "text-slate-400",
  PROPOSED: "text-blue-500",
  APPROVED: "text-emerald-600",
  REJECTED: "text-rose-500",
};

export function ResolutionWorkspace({ data }: { data: ResolutionWorkspaceData | null }) {
  if (!data) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 items-center p-6">
        <Card className="w-full">
          <div className="space-y-3 p-6">
            <CircleHelp className="text-slate-400" />
            <h2 className="text-lg font-bold">Este movimiento no está disponible.</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Puede haber sido eliminado o no estar dentro de tus consorcios autorizados.
            </p>
            <Link href="/" className="text-sm font-semibold text-blue-600 hover:underline">
              Volver a Inicio
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  const { payment, proposal, intelligence, history } = data;
  const estado = data.resolved ? "Resuelto" : payment.status === "UNMATCHED" ? "Necesita revisión" : "Pendiente de decisión";
  const estadoTono: "green" | "amber" | "slate" = data.resolved ? "green" : payment.status === "UNMATCHED" ? "amber" : "slate";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4 sm:p-6">
      <nav aria-label="Ubicación" className="flex items-center gap-1 text-xs font-medium text-slate-500">
        <Link href="/" className="text-blue-600 hover:underline">Inicio</Link>
        <span>/</span>
        <Link href="/conciliacion" className="text-blue-600 hover:underline">Conciliación</Link>
        <span>/</span>
        <span>Caso</span>
      </nav>

      {/* A. Resumen del caso — el título es el importe real (dato crítico, nunca se trunca);
          la organización es contexto secundario y puede truncarse sin ocultar la decisión. */}
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resolver conciliación</p>
          <h2 className="mt-1 text-xl font-bold whitespace-nowrap text-slate-900 dark:text-slate-100">
            {formatMonto(payment.amount, payment.currency)}
          </h2>
          <p className="mt-0.5 truncate text-sm text-slate-600 dark:text-slate-300">{payment.organizationName}</p>
        </div>
        <Badge tone={estadoTono}>{estado}</Badge>
      </section>

      <Card>
        <CardHeader title="¿Qué pasó?" subtitle={formatDateTime(payment.createdAt)} />
        <div className="grid gap-3 p-5 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">Movimiento</p>
            <p className="font-semibold">{formatMonto(payment.amount, payment.currency)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Banco / origen</p>
            <p className="font-semibold">{payment.provider}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Fecha del movimiento</p>
            <p>{payment.transactionDate ? formatDateTime(payment.transactionDate) : "No informada"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Referencia</p>
            <p>{payment.referenceNumber ?? payment.concept ?? "Sin referencia"}</p>
          </div>
          {payment.payerIdentifier ? (
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-500">Identificador del pagador</p>
              <p>{payment.payerIdentifier}</p>
            </div>
          ) : null}
        </div>
      </Card>

      {/* B. Propuesta de ConcilIA — sólo la conclusión; la evidencia que la sostiene vive en su propia sección (C). */}
      <Card>
        <CardHeader title="¿Qué propone ConcilIA?" subtitle="Una propuesta se presenta sólo cuando ya existe una evaluación persistida." />
        <div className="p-5">
          {intelligence ? (
            <FinancialIntelligencePanel intelligence={intelligence} />
          ) : !proposal ? (
            <div className="flex gap-3 text-sm text-slate-600 dark:text-slate-300">
              <CircleAlert className="shrink-0 text-amber-500" />
              Todavía no hay una propuesta disponible para este movimiento. Necesita más información antes de decidir.
            </div>
          ) : (
            <div className="flex gap-3">
              {proposal.kind === "AMBIGUOUS" ? (
                <CircleHelp size={18} className="mt-0.5 shrink-0 text-amber-500" />
              ) : (
                <Sparkles size={18} className="mt-0.5 shrink-0 text-blue-500" />
              )}
              <div>
                <p className="text-sm font-semibold">
                  {proposal.kind === "AMBIGUOUS"
                    ? "Hay varios candidatos posibles"
                    : proposal.unitCode
                      ? `Coincidencia probable: UF ${proposal.unitCode}`
                      : "La propuesta necesita verificación"}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{proposal.explanation}</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* C. Evidencia — bloque reutilizable; hoy sólo hay señales bancarias coincidentes. */}
      {proposal && !intelligence ? (
        <Card>
          <CardHeader title="Evidencia" subtitle="En qué se basa la propuesta de ConcilIA." />
          <div className="p-5">
            <EvidenceList
              items={proposal.evidence}
              emptyMessage="La evaluación no trae evidencia legible adicional en este entorno."
            />
          </div>
        </Card>
      ) : null}

      {/* D+E. Candidatos (cuando hay más de uno) y Decisión humana — la elección es por candidato, así que comparten bloque. */}
      <Card>
        <CardHeader
          title="¿Qué podés decidir?"
          subtitle={data.resolved ? "Este caso ya tiene una conciliación aprobada registrada." : "Las decisiones quedan registradas en el historial del caso."}
        />
        <div className="p-5">
          {data.resolved ? (
            <div className="space-y-2">
              <p className="flex gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 size={17} />
                La conciliación ya fue resuelta. No se volverá a registrar una decisión desde este Workspace.
              </p>
              <Link href="/" className="text-sm font-semibold text-blue-600 hover:underline">Volver a pendientes</Link>
            </div>
          ) : proposal ? (
            <ResolutionActions paymentId={payment.id} proposal={proposal} />
          ) : (
            <Link href="/conciliacion" className="text-sm font-semibold text-blue-600 hover:underline">Ir a Conciliación para investigar</Link>
          )}
        </div>
      </Card>

      {/* F. Historial/provenance — cada evento se distingue por su origen (sistema vs. decisión humana). */}
      <Card>
        <CardHeader title="¿Qué pasó antes?" subtitle="Historia de este movimiento; la propuesta y la decisión humana se mantienen separadas." />
        <ol className="divide-y divide-slate-100 dark:divide-slate-800">
          {history.map((item) => {
            const Icon = historyIcon[item.kind];
            return (
              <li key={item.id} className="flex gap-3 px-5 py-4">
                <Icon size={16} className={`mt-0.5 shrink-0 ${historyTone[item.kind]}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{formatDateTime(item.createdAt)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </main>
  );
}
