import { describe, expect, it, vi } from "vitest";
import { loadTodayAttention } from "./today-attention-tool";

function tx(overrides: { membership?: unknown; decisionCount?: number; decisionError?: boolean; informationCount?: number } = {}) {
  return {
    organizationAdministrator: { findUnique: vi.fn().mockResolvedValue(overrides.membership === undefined ? { administrator: { deletedAt: null }, organization: { status: "ACTIVE", deletedAt: null } } : overrides.membership) },
    paymentEvidenceAssessmentLog: { count: overrides.decisionError ? vi.fn().mockRejectedValue(new Error("offline")) : vi.fn().mockResolvedValue(overrides.decisionCount ?? 3) },
    paymentTransaction: { findMany: vi.fn().mockResolvedValue(Array.from({ length: overrides.informationCount ?? 1 }, (_, index) => ({ id: `tx-${index}` }))) },
  };
}

describe("TODAY_ATTENTION tool", () => {
  it("uses real Inbox semantics without inventing values", async () => {
    const result = await loadTodayAttention(tx() as never, "admin-a", "org-a");
    expect(result.message).toBe("Hay 4 situaciones que requieren tu atención. 3 necesitan una decisión; 1 necesita información.");
  });

  it("does not expose a partial total when one metric is unavailable", async () => {
    const result = await loadTodayAttention(tx({ decisionError: true, informationCount: 4 }) as never, "admin-a", "org-a");
    expect(result.message).toBe("No puedo calcular un total confiable porque una parte de la información operativa no está disponible.");
    expect(result.message).not.toContain("4 situaciones");
  });

  it.each([
    null,
    { administrator: { deletedAt: new Date() }, organization: { status: "ACTIVE", deletedAt: null } },
    { administrator: { deletedAt: null }, organization: { status: "INACTIVE", deletedAt: null } },
  ])("fails closed for inactive/missing access", async (membership) => {
    await expect(loadTodayAttention(tx({ membership }) as never, "admin-a", "org-a")).rejects.toThrow("AGENT_ACCESS_DENIED");
  });

  it("scopes every operational query before reading", async () => {
    const fake = tx();
    await loadTodayAttention(fake as never, "admin-a", "org-a");
    expect(fake.paymentEvidenceAssessmentLog.count.mock.calls[0][0].where.paymentTransaction.organizationId).toBe("org-a");
    expect(fake.paymentTransaction.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: "org-a", status: "UNMATCHED" });
  });
});
