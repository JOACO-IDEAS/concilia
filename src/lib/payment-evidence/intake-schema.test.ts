import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(resolve(root, "prisma/migrations/20260821210000_add_payment_evidence_intake/migration.sql"), "utf8");

describe("PaymentEvidenceIntake persistence contract", () => {
  it("is tenant-scoped, minimal, append-only and externally idempotent", () => {
    const model = schema.match(/model PaymentEvidenceIntake \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(model).toContain("organizationId");
    expect(model).toContain("@@unique([organizationId, source, externalReference])");
    expect(model).toMatch(/state\s+PaymentEvidenceIntakeState\s+@default\(RECEIVED\)/);
    expect(model.match(/onDelete: Restrict/g)).toHaveLength(2);
    expect(model).not.toMatch(/updatedAt|raw|content|extracted|unitId|payerId|obligationId|paymentTransactionId/i);
  });

  it("uses an additive migration with no data or destructive statements", () => {
    expect(migration).toContain('CREATE TABLE "payment_evidence_intakes"');
    expect(migration).not.toMatch(/^\s*(?:DROP|DELETE|UPDATE|TRUNCATE|INSERT)\b/im);
  });
});
