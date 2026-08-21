import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { formatMonto } from "@/lib/format";

const SOURCE_LIMIT = 1001;
const RESULT_LIMIT = 10;
export type DebtOverviewResult = { message: string; truncated: boolean; results: Array<{ organizationId: string; organizationName: string; outstandingLabel: string; overdueUnits: number; href: string }> };

export async function loadDebtOverview(tx: Prisma.TransactionClient, administratorId: string): Promise<DebtOverviewResult> {
  const obligations = await tx.obligation.findMany({ where: { deletedAt: null, status: { in: ["PENDING", "PARTIALLY_PAID"] }, unit: { deletedAt: null, organization: { status: "ACTIVE", deletedAt: null, administrators: { some: { administratorId, administrator: { deletedAt: null } } } } } }, select: { amount: true, paidAmount: true, unitId: true, unit: { select: { organizationId: true, organization: { select: { name: true, billingProfiles: { where: { isDefault: true, deletedAt: null }, select: { billingCurrency: true }, take: 1 } } } } } }, orderBy: { id: "asc" }, take: SOURCE_LIMIT });
  const truncated = obligations.length >= SOURCE_LIMIT;
  const grouped = new Map<string, { organizationName: string; currency: string | null; outstanding: number; units: Set<string> }>();
  for (const item of obligations.slice(0, SOURCE_LIMIT - 1)) { const outstanding = Math.max(0, item.amount.toNumber() - item.paidAmount.toNumber()); if (!outstanding) continue; const current = grouped.get(item.unit.organizationId) ?? { organizationName: item.unit.organization.name, currency: item.unit.organization.billingProfiles[0]?.billingCurrency ?? null, outstanding: 0, units: new Set<string>() }; current.outstanding += outstanding; current.units.add(item.unitId); grouped.set(item.unit.organizationId, current); }
  const results = [...grouped].map(([organizationId, item]) => ({ organizationId, organizationName: item.organizationName, currency: item.currency, outstanding: item.outstanding, overdueUnits: item.units.size })).sort((a, b) => b.outstanding - a.outstanding || a.organizationName.localeCompare(b.organizationName, "es")).slice(0, RESULT_LIMIT).map(({ outstanding, currency, ...item }) => ({ ...item, outstandingLabel: currency ? formatMonto(outstanding, currency) : `${outstanding.toLocaleString("es-AR")} (moneda no disponible)`, href: "/unidades-config" }));
  return { message: truncated ? "Hay más obligaciones que el límite seguro de consulta; te muestro un ranking parcial basado en las primeras 1.000, sin presentarlo como total definitivo." : results.length ? `Estos son los ${results.length} consorcios con mayor saldo pendiente real.` : "No hay obligaciones pendientes con saldo real disponible.", truncated, results };
}
