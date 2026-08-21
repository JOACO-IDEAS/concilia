import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("payment evidence correlation database invariants", () => {
  it("garantiza una sola confirmación por aviso y no agrega updatedAt", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const model = schema.match(/model PaymentEvidenceCorrelation \{[\s\S]*?\n\}/)?.[0] ?? "";
    const migration = readFileSync(join(process.cwd(), "prisma/migrations/20260821123000_add_payment_evidence_correlations/migration.sql"), "utf8");
    expect(model).toContain("createdAt");
    expect(model).not.toContain("updatedAt");
    expect(migration).toContain("WHERE \"status\" = 'CONFIRMED'");
    expect(migration).toContain("confidence_check");
  });
});
