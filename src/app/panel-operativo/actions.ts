"use server";

// Fase 4 Parte D/E — Server Actions de la bandeja de trabajo del Agent OS.
// Todas corren contra la base real de la app (producción hoy) — a
// propósito: esta pantalla debe reflejar el estado real, no datos de
// prueba (ver informe de Fase 4 Parte D).
//
// Fase 4 Parte E agrega la ÚNICA escritura de esta pantalla:
// `marcarObservacionComoAtendidaAction` — un humano marcando UNA
// observación como atendida (reusa `status=RESOLVED`, sin estado nuevo).
// Ninguna otra acción de esta pantalla escribe nada. Ninguna acción externa
// (WhatsApp/email/transferencia) existe acá ni existirá hasta que una fase
// futura lo apruebe explícitamente.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerBandejaDeTrabajo, obtenerObservacionesRelacionadas, type BandejaDeTrabajo, type ObservacionEnBandeja } from "@/lib/agent-os/work-queue";
import { marcarComoAtendida, obtenerObservacionPorId } from "@/lib/agent-os/observation-store";
import { obtenerResumenOperativo, type ResumenOperativo } from "@/lib/agent-os/resumen-operativo";
import { obtenerResumenComplianceDeConsorcio, type ResumenComplianceConsorcio } from "@/lib/compliance/compliance-summary";
import type { ObservacionAgentePersistida } from "@/lib/agent-os/types";
import { requireCurrentAdministrator } from "@/lib/auth/session";
import { requireOrganizationAccess } from "@/lib/auth/organization-access";

const PATH = "/panel-operativo";

async function requireObservationAccess(id: string): Promise<void> {
  const observation = await prisma.agentObservation.findUnique({ where: { id }, select: { organizationId: true } });
  if (!observation?.organizationId) throw new Error("Recurso no disponible.");
  await requireOrganizationAccess(observation.organizationId);
}

export async function obtenerBandejaDeTrabajoAction(organizationId?: string): Promise<BandejaDeTrabajo> {
  if (organizationId) await requireOrganizationAccess(organizationId);
  else await requireCurrentAdministrator();
  return prisma.$transaction((tx) => obtenerBandejaDeTrabajo(tx, { organizationId }));
}

export async function obtenerObservacionDetalleAction(id: string): Promise<ObservacionAgentePersistida | null> {
  await requireObservationAccess(id);
  return prisma.$transaction((tx) => obtenerObservacionPorId(tx, id));
}

/**
 * Fase 4.F — cruce de contexto (§7 del pedido): otras observaciones ABIERTAS
 * que comparten organización real con esta, sin importar qué agente las
 * generó. Nunca cruza por proveedor/pago específico (esa relación no existe
 * en el modelo — ver work-queue.ts::obtenerObservacionesRelacionadas).
 */
export async function obtenerObservacionesRelacionadasAction(id: string): Promise<ObservacionEnBandeja[]> {
  await requireObservationAccess(id);
  return prisma.$transaction((tx) => obtenerObservacionesRelacionadas(tx, id));
}

export async function obtenerResumenOperativoAction(organizationId?: string): Promise<ResumenOperativo> {
  if (organizationId) await requireOrganizationAccess(organizationId);
  else await requireCurrentAdministrator();
  return prisma.$transaction((tx) => obtenerResumenOperativo(tx, { organizationId }));
}

/**
 * Fase 5.2 — mejora 2: resumen de compliance por consorcio, solo cuando hay
 * UN consorcio puntual en foco (ver page.tsx) — evita una consulta por
 * organización en la vista "todos los consorcios".
 */
export async function obtenerResumenComplianceDeConsorcioAction(organizationId: string): Promise<ResumenComplianceConsorcio> {
  await requireOrganizationAccess(organizationId);
  return prisma.$transaction((tx) => obtenerResumenComplianceDeConsorcio(tx, organizationId));
}

export interface OrganizacionOpcion {
  id: string;
  name: string;
}

export async function listarOrganizacionesAction(): Promise<OrganizacionOpcion[]> {
  const administrator = await requireCurrentAdministrator();
  return prisma.organization.findMany({
    where: { deletedAt: null, administrators: { some: { administratorId: administrator.id } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Única escritura de esta pantalla — un humano marca UNA observación como
 * atendida. Nunca automático, nunca disparado por un agente. Ver el
 * comentario de `marcarComoAtendida` (observation-store.ts) para por qué es
 * seguro reusar `status=RESOLVED` sin inventar un estado nuevo.
 */
export async function marcarObservacionComoAtendidaAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  await requireObservationAccess(id);

  await prisma.$transaction((tx) => marcarComoAtendida(tx, id));
  revalidatePath(PATH);

  const organizacion = formData.get("organizacion");
  redirect(typeof organizacion === "string" && organizacion ? `${PATH}?organizacion=${organizacion}` : PATH);
}
