import { describe, expect, it, vi } from "vitest";
import { loadReconciliationReview } from "./reconciliation-review-tool";
import { loadDebtOverview } from "./debt-overview-tool";
import { loadReconciliationLookup } from "./reconciliation-lookup-tool";
import { loadOrganizationLookup } from "./organization-lookup-tool";

const decimal = (value: number) => ({ toNumber: () => value });
const membership = { administrator: { deletedAt: null }, organization: { status: "ACTIVE", deletedAt: null } };

describe("read-only operational Agent tools", () => {
  it("returns bounded authorized reconciliation cases with safe deep links", async () => {
    const findMany = vi.fn().mockResolvedValue(Array.from({ length: 11 }, (_, i) => ({ id: `a${i}`, paymentTransactionId: `p${i}`, paymentTransaction: { amount: decimal(100 + i), currency: "ARS", organization: { name: "Consorcio A" } } })));
    const tx = { organizationAdministrator: { findUnique: vi.fn().mockResolvedValue(membership) }, paymentEvidenceAssessmentLog: { findMany } };
    const result = await loadReconciliationReview(tx as never, "admin-a", "org-a");
    expect(result.cases).toHaveLength(10); expect(result.cases[0].href).toBe("/conciliacion/resolver/p0");
    expect(findMany.mock.calls[0][0].where.paymentTransaction.organizationId).toBe("org-a");
    expect(findMany.mock.calls[0][0].take).toBe(11);
  });

  it("has a truthful reconciliation empty state and fails closed cross-tenant", async () => {
    const tx = { organizationAdministrator: { findUnique: vi.fn().mockResolvedValue(membership) }, paymentEvidenceAssessmentLog: { findMany: vi.fn().mockResolvedValue([]) } };
    await expect(loadReconciliationReview(tx as never, "admin-a", "org-a")).resolves.toMatchObject({ total: 0, cases: [] });
    tx.organizationAdministrator.findUnique.mockResolvedValueOnce(null);
    await expect(loadReconciliationReview(tx as never, "admin-a", "org-b")).rejects.toThrow("AGENT_ACCESS_DENIED");
  });

  it("ranks real outstanding obligations deterministically without legacy estimates", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { amount: decimal(300), paidAmount: decimal(50), unitId: "u1", unit: { organizationId: "o2", organization: { name: "Zulu", billingProfiles: [{ billingCurrency: "ARS" }] } } },
      { amount: decimal(200), paidAmount: decimal(0), unitId: "u2", unit: { organizationId: "o1", organization: { name: "Alfa", billingProfiles: [{ billingCurrency: "ARS" }] } } },
    ]);
    const result = await loadDebtOverview({ obligation: { findMany } } as never, "admin-a");
    expect(result.results.map((item) => item.organizationName)).toEqual(["Zulu", "Alfa"]);
    expect(findMany.mock.calls[0][0].where.unit.organization.administrators.some.administratorId).toBe("admin-a");
    expect(JSON.stringify(result)).not.toMatch(/estimad|bankAccount|taxId/i);
  });

  it("looks up an exact amount, reports multiple/no matches, validates and limits", async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, amount: decimal(210000), currency: "ARS", referenceNumber: i ? null : "REF-1", transactionDate: null, createdAt: new Date("2026-08-01"), status: "UNMATCHED", organization: { name: "A" } }));
    const findMany = vi.fn().mockResolvedValue(rows);
    const tx = { organizationAdministrator: { findUnique: vi.fn().mockResolvedValue(membership) }, paymentTransaction: { findMany } };
    const result = await loadReconciliationLookup(tx as never, "admin-a", "org-a", { amount: 210000 });
    expect(result.matches).toHaveLength(10); expect(result.truncated).toBe(true); expect(findMany.mock.calls[0][0].where).toMatchObject({ organizationId: "org-a", amount: 210000 });
    findMany.mockResolvedValueOnce([]); await expect(loadReconciliationLookup(tx as never, "admin-a", "org-a", { reference: "NOPE" })).resolves.toMatchObject({ matches: [] });
    await expect(loadReconciliationLookup(tx as never, "admin-a", "org-a", { amount: -1 })).rejects.toThrow("INVALID_LOOKUP");
  });

  it("returns only authorized organizations and real counts, with unknown indistinguishable", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "o1", name: "Santa Fe 1842", address: "Santa Fe 1842", status: "ACTIVE", _count: { units: 8, paymentTransactions: 12 } }]);
    const result = await loadOrganizationLookup({ organization: { findMany } } as never, "admin-a", "Santa Fe 1842");
    expect(result.organizations[0]).toMatchObject({ unitCount: 8, paymentCount: 12, href: "/unidades-config" });
    expect(findMany.mock.calls[0][0].where.administrators.some.administratorId).toBe("admin-a");
    expect(JSON.stringify(result)).not.toMatch(/saldoPendiente|useAppStore|taxId/);
    findMany.mockResolvedValueOnce([]); await expect(loadOrganizationLookup({ organization: { findMany } } as never, "admin-b", "Santa Fe 1842")).resolves.toMatchObject({ organizations: [] });
  });
});
