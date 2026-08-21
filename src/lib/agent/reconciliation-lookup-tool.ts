import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { formatMonto } from "@/lib/format";

const LIMIT = 10;
export type ReconciliationLookupInput = { amount?: number; reference?: string; date?: string };
export type ReconciliationLookupResult = { message: string; truncated: boolean; matches: Array<{ id: string; amountLabel: string; organizationName: string; referenceLabel: string; dateLabel: string; status: string; href: string }> };

export async function loadReconciliationLookup(tx: Prisma.TransactionClient, administratorId: string, organizationId: string, input: ReconciliationLookupInput): Promise<ReconciliationLookupResult> {
  const membership = await tx.organizationAdministrator.findUnique({ where: { administratorId_organizationId: { administratorId, organizationId } }, select: { administrator: { select: { deletedAt: true } }, organization: { select: { status: true, deletedAt: true } } } });
  if (!membership || membership.administrator.deletedAt || membership.organization.deletedAt || membership.organization.status !== "ACTIVE") throw new Error("AGENT_ACCESS_DENIED");
  if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount <= 0)) throw new Error("INVALID_LOOKUP");
  if (input.reference !== undefined && !/^[a-z0-9_-]{2,40}$/i.test(input.reference)) throw new Error("INVALID_LOOKUP");
  let dateRange: { gte: Date; lt: Date } | undefined;
  if (input.date !== undefined) { const start = new Date(`${input.date}T00:00:00.000Z`); if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== input.date) throw new Error("INVALID_LOOKUP"); dateRange = { gte: start, lt: new Date(start.getTime() + 86_400_000) }; }
  if (input.amount === undefined && input.reference === undefined && !dateRange) throw new Error("INVALID_LOOKUP");
  const rows = await tx.paymentTransaction.findMany({ where: { organizationId, ...(input.amount !== undefined ? { amount: input.amount } : {}), ...(input.reference ? { referenceNumber: { contains: input.reference, mode: "insensitive" } } : {}), ...(dateRange ? { transactionDate: dateRange } : {}) }, select: { id: true, amount: true, currency: true, referenceNumber: true, transactionDate: true, createdAt: true, status: true, organization: { select: { name: true } } }, orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }], take: LIMIT + 1 });
  const truncated = rows.length > LIMIT;
  const matches = rows.slice(0, LIMIT).map((row) => ({ id: row.id, amountLabel: formatMonto(row.amount.toNumber(), row.currency), organizationName: row.organization?.name ?? "Organización", referenceLabel: row.referenceNumber ?? "Sin referencia", dateLabel: (row.transactionDate ?? row.createdAt).toISOString().slice(0, 10), status: row.status, href: `/conciliacion/resolver/${row.id}` }));
  return { message: matches.length === 0 ? "No encontré movimientos con esos criterios." : truncated ? `Encontré más de ${LIMIT} coincidencias. Te muestro las primeras ${LIMIT}.` : matches.length === 1 ? "Encontré un movimiento." : `Encontré ${matches.length} coincidencias.`, truncated, matches };
}
