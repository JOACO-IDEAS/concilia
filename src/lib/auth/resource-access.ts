import "server-only";

import { prisma } from "@/lib/prisma";
import { requireOrganizationAccess } from "./organization-access";

function notFoundOrDenied(): never {
  throw new Error("Recurso no disponible.");
}

export async function requirePaymentAccess(paymentTransactionId: string) {
  const payment = await prisma.paymentTransaction.findUnique({ where: { id: paymentTransactionId }, select: { id: true, organizationId: true } });
  if (!payment?.organizationId) return notFoundOrDenied();
  return { ...(await requireOrganizationAccess(payment.organizationId)), payment };
}

export async function requireUnitAccess(unitId: string) {
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true, organizationId: true } });
  if (!unit) return notFoundOrDenied();
  return { ...(await requireOrganizationAccess(unit.organizationId)), unit };
}

export async function requireObligationAccess(obligationId: string) {
  const obligation = await prisma.obligation.findUnique({ where: { id: obligationId }, select: { id: true, unit: { select: { organizationId: true } } } });
  if (!obligation) return notFoundOrDenied();
  return { ...(await requireOrganizationAccess(obligation.unit.organizationId)), obligation };
}

export async function requireUnitOwnerAccess(ownerId: string) {
  const owner = await prisma.unitOwner.findUnique({ where: { id: ownerId }, select: { id: true, unit: { select: { organizationId: true } } } });
  if (!owner) return notFoundOrDenied();
  return { ...(await requireOrganizationAccess(owner.unit.organizationId)), owner };
}
