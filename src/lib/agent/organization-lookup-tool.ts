import "server-only";
import type { Prisma } from "@/generated/prisma/client";

const LIMIT = 10;
export type OrganizationLookupResult = { message: string; truncated: boolean; organizations: Array<{ id: string; name: string; address: string; status: string; unitCount: number; paymentCount: number; href: string }> };

export async function loadOrganizationLookup(tx: Prisma.TransactionClient, administratorId: string, query: string): Promise<OrganizationLookupResult> {
  const value = query.normalize("NFKC").trim();
  if (value.length < 2 || value.length > 80 || /[<>\u0000-\u001f]/.test(value)) throw new Error("INVALID_LOOKUP");
  const rows = await tx.organization.findMany({ where: { deletedAt: null, status: "ACTIVE", administrators: { some: { administratorId, administrator: { deletedAt: null } } }, name: { contains: value, mode: "insensitive" } }, select: { id: true, name: true, address: true, status: true, _count: { select: { units: { where: { deletedAt: null } }, paymentTransactions: true } } }, orderBy: [{ name: "asc" }, { id: "asc" }], take: LIMIT + 1 });
  const truncated = rows.length > LIMIT;
  const organizations = rows.slice(0, LIMIT).map((row) => ({ id: row.id, name: row.name, address: row.address, status: row.status, unitCount: row._count.units, paymentCount: row._count.paymentTransactions, href: "/unidades-config" }));
  return { message: organizations.length === 0 ? "No encontré un consorcio accesible con ese nombre." : truncated ? `Encontré más de ${LIMIT} consorcios. Te muestro los primeros ${LIMIT}.` : organizations.length === 1 ? "Encontré este consorcio." : `Encontré ${organizations.length} consorcios.`, truncated, organizations };
}
