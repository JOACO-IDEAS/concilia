import "server-only";

import { prisma } from "@/lib/prisma";
import { requireCurrentAdministrator } from "./session";

export class OrganizationAccessDeniedError extends Error {
  constructor() {
    super("No tenés acceso a esta organización.");
    this.name = "OrganizationAccessDeniedError";
  }
}

/** Autoridad server-side: membership real, no organizationId provisto por el cliente. */
export async function requireOrganizationAccess(organizationId: string) {
  const administrator = await requireCurrentAdministrator();
  const membership = await prisma.organizationAdministrator.findUnique({
    where: { administratorId_organizationId: { administratorId: administrator.id, organizationId } },
    select: { organizationId: true },
  });
  if (!membership) throw new OrganizationAccessDeniedError();
  return { administrator, organizationId: membership.organizationId };
}
