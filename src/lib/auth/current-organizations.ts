import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Organizaciones reales del administrador autenticado, solo lectura.
 * Usado únicamente para mostrar contexto en el shell (Topbar) — nunca decide
 * autorización (eso sigue siendo exclusivamente requireOrganizationAccess).
 */
export async function loadOrganizationsForAdministrator(
  administratorId: string
): Promise<{ id: string; name: string }[]> {
  const memberships = await prisma.organizationAdministrator.findMany({
    where: { administratorId },
    select: { organization: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((membership) => membership.organization);
}
