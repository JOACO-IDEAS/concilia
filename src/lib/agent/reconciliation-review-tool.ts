import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { formatMonto } from "@/lib/format";

const LIMIT = 10;
export type ReconciliationReviewResult = { message: string; total: number; cases: Array<{ id: string; title: string; organizationName: string; amountLabel: string; reason: string; href: string }> };

export async function loadReconciliationReview(tx: Prisma.TransactionClient, administratorId: string, organizationId: string): Promise<ReconciliationReviewResult> {
  const membership = await tx.organizationAdministrator.findUnique({ where: { administratorId_organizationId: { administratorId, organizationId } }, select: { administrator: { select: { deletedAt: true } }, organization: { select: { status: true, deletedAt: true } } } });
  if (!membership || membership.administrator.deletedAt || membership.organization.deletedAt || membership.organization.status !== "ACTIVE") throw new Error("AGENT_ACCESS_DENIED");
  const rows = await tx.paymentEvidenceAssessmentLog.findMany({
    where: { state: "NEEDS_DECISION", paymentTransaction: { organizationId, reconciliationMatches: { none: { decision: { in: ["APPROVED", "REJECTED"] } } } } },
    select: { id: true, paymentTransactionId: true, paymentTransaction: { select: { amount: true, currency: true, organization: { select: { name: true } } } } },
    orderBy: [{ evaluatedAt: "asc" }, { id: "asc" }], take: LIMIT + 1,
  });
  const cases = rows.slice(0, LIMIT).map((row) => ({ id: row.id, title: "Pago que requiere revisión", organizationName: row.paymentTransaction.organization?.name ?? "Organización", amountLabel: formatMonto(row.paymentTransaction.amount.toNumber(), row.paymentTransaction.currency), reason: "La evidencia disponible requiere una decisión humana.", href: `/conciliacion/resolver/${row.paymentTransactionId}` }));
  const total = rows.length;
  return { message: total === 0 ? "No hay pagos que requieran una decisión en este consorcio." : `Encontré ${total > LIMIT ? `${LIMIT}+` : total} ${total === 1 ? "pago" : "pagos"} para revisar.${total > LIMIT ? ` Te muestro los primeros ${LIMIT}.` : ""}`, total, cases };
}
