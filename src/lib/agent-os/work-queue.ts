// Agent OS — Fase 4 Parte D/E. "Bandeja de trabajo" — agregación de LECTURA
// sobre AgentObservation, agnóstica de qué agente generó cada fila (hoy
// solo Compliance escribe acá, pero esta función nunca lo asume). Mismo
// principio que observability.ts para el motor de matching: solo lectura,
// nunca decide ni ejecuta nada.
//
// 🔴 requierenAtencion = OPEN + CRITICAL
// 🟡 enSeguimiento     = OPEN + WARNING/INFO
// 🟢 resueltas         = RESOLVED
//
// Fase 4 Parte E — filtro por organización (§11 del pedido): las
// observaciones que hoy genera el detector suelen tener `organizationId
// = null` (un documento reutilizable, o un proveedor que sirve a varias
// organizaciones — ver compliance-detector.ts). Filtrar ingenuamente por
// `AgentObservation.organizationId` dejaría esas observaciones invisibles
// SIEMPRE que se filtre por una organización puntual. En cambio, se
// resuelven las organizaciones a las que cada observación APLICA vía
// `ProviderOrganization` — sin tabla nueva, reutilizando la relación que
// ya existe (Compliance Foundation, Fase 4 Parte C).

import type { Prisma } from "@/generated/prisma/client";
import { listarObservaciones } from "./observation-store";
import type { ObservacionAgentePersistida } from "./types";

export interface ObservacionEnBandeja extends ObservacionAgentePersistida {
  providerName: string | null;
  // Organización(es) a las que aplica esta observación — puede ser más de
  // una cuando el proveedor sirve a varios consorcios y la observación no
  // es específica de uno (organizationId=null en la fila).
  organizationNames: string[];
  // Fase 4.F — mismos ids que organizationNames, en el mismo orden. Se usan
  // para cruzar contexto entre observaciones (ver obtenerObservacionesRelacionadas)
  // sin comparar por nombre — un nombre podría, en teoría, no ser único.
  organizationIds: string[];
}

export interface BandejaDeTrabajo {
  requierenAtencion: number;
  enSeguimiento: number;
  resueltas: number;
  observacionesAbiertas: ObservacionEnBandeja[]; // CRITICAL primero, luego WARNING/INFO
  observacionesResueltas: ObservacionEnBandeja[];
}

export interface OpcionesBandeja {
  organizationId?: string; // filtra por UNA organización puntual — sin esto, todas
}

/** A qué organizaciones aplica cada observación — propia si la tiene, o todas las del proveedor si no. */
function construirResolverDeOrganizaciones(
  vinculos: { providerId: string; organizationId: string }[]
): (o: ObservacionAgentePersistida) => string[] {
  const orgsPorProvider = new Map<string, string[]>();
  for (const v of vinculos) {
    const arr = orgsPorProvider.get(v.providerId) ?? [];
    arr.push(v.organizationId);
    orgsPorProvider.set(v.providerId, arr);
  }
  return (o: ObservacionAgentePersistida) => {
    if (o.organizationId) return [o.organizationId];
    if (o.providerId) return orgsPorProvider.get(o.providerId) ?? [];
    return [];
  };
}

export async function obtenerBandejaDeTrabajo(
  tx: Prisma.TransactionClient,
  opciones: OpcionesBandeja = {}
): Promise<BandejaDeTrabajo> {
  const [abiertasSinFiltrar, resueltasSinFiltrar] = await Promise.all([
    listarObservaciones(tx, { status: "OPEN" }),
    listarObservaciones(tx, { status: "RESOLVED" }),
  ]);

  const todasLasObservaciones = [...abiertasSinFiltrar, ...resueltasSinFiltrar];
  const providerIds = [...new Set(todasLasObservaciones.map((o) => o.providerId).filter((id): id is string => id !== null))];
  const organizationIdsDirectos = [
    ...new Set(todasLasObservaciones.map((o) => o.organizationId).filter((id): id is string => id !== null)),
  ];

  const [providers, vinculos] = await Promise.all([
    providerIds.length > 0 ? tx.provider.findMany({ where: { id: { in: providerIds } }, select: { id: true, name: true } }) : [],
    providerIds.length > 0
      ? tx.providerOrganization.findMany({
          where: { providerId: { in: providerIds }, activo: true },
          select: { providerId: true, organizationId: true },
        })
      : [],
  ]);
  const nombreProvider = new Map(providers.map((p) => [p.id, p.name]));
  const resolverOrganizaciones = construirResolverDeOrganizaciones(vinculos);

  const todosLosOrgIds = [...new Set([...organizationIdsDirectos, ...vinculos.map((v) => v.organizationId)])];
  const organizaciones = todosLosOrgIds.length > 0 ? await tx.organization.findMany({ where: { id: { in: todosLosOrgIds } }, select: { id: true, name: true } }) : [];
  const nombreOrg = new Map(organizaciones.map((o) => [o.id, o.name]));

  function enriquecer(o: ObservacionAgentePersistida): ObservacionEnBandeja {
    const idsResueltos = resolverOrganizaciones(o);
    return {
      ...o,
      providerName: o.providerId ? (nombreProvider.get(o.providerId) ?? null) : null,
      organizationNames: idsResueltos.map((id) => nombreOrg.get(id)).filter((n): n is string => n !== undefined),
      organizationIds: idsResueltos,
    };
  }

  function pasaElFiltro(o: ObservacionAgentePersistida): boolean {
    if (!opciones.organizationId) return true;
    return resolverOrganizaciones(o).includes(opciones.organizationId);
  }

  const observacionesAbiertas = abiertasSinFiltrar.filter(pasaElFiltro).map(enriquecer);
  const observacionesResueltas = resueltasSinFiltrar.filter(pasaElFiltro).map(enriquecer);

  return {
    requierenAtencion: observacionesAbiertas.filter((o) => o.severity === "CRITICAL").length,
    enSeguimiento: observacionesAbiertas.filter((o) => o.severity !== "CRITICAL").length,
    resueltas: observacionesResueltas.length,
    observacionesAbiertas,
    observacionesResueltas,
  };
}

/**
 * Fase 4.F — cruce de contexto por CONSORCIO (§7 del pedido): dadas dos
 * observaciones que comparten al menos una organización real (vía
 * `organizationIds`, nunca por nombre/heurística), son "contexto
 * relacionado" — sin importar qué agente las generó. Deliberadamente NO
 * cruza por proveedor/pago específico: esa relación no existe en el modelo
 * de datos (`PaymentTransaction` no tiene `providerId`) y no se inventa.
 *
 * Reutiliza `obtenerBandejaDeTrabajo` sin filtro (trae todas las
 * organizaciones) para no duplicar la resolución de organización — misma
 * lógica, una sola vez.
 */
export async function obtenerObservacionesRelacionadas(
  tx: Prisma.TransactionClient,
  observacionId: string
): Promise<ObservacionEnBandeja[]> {
  const bandeja = await obtenerBandejaDeTrabajo(tx);
  const todas = [...bandeja.observacionesAbiertas, ...bandeja.observacionesResueltas];
  const objetivo = todas.find((o) => o.id === observacionId);
  if (!objetivo || objetivo.organizationIds.length === 0) return [];

  return bandeja.observacionesAbiertas.filter(
    (o) => o.id !== observacionId && o.organizationIds.some((id) => objetivo.organizationIds.includes(id))
  );
}
