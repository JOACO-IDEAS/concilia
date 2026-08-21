import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20260821233000_link_extraction_runs_to_correlations/migration.sql"), "utf8");

describe("intake correlation persistence", () => {
  it("reuses PaymentEvidenceCorrelation with extraction-run provenance", () => {
    const model = schema.match(/model PaymentEvidenceCorrelation \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(model).toContain("extractionRunId");
    expect(model).toContain("@@unique([extractionRunId, paymentTransactionId, status])");
    expect(model).not.toMatch(/unitId|payerId|obligationId/i);
  });

  it("requires exactly one provenance and preserves existing notice rows", () => {
    expect(migration).toContain("exactly_one_provenance_check");
    expect(migration).toContain('ALTER COLUMN "paymentNoticeId" DROP NOT NULL');
    expect(migration).not.toMatch(/^\s*(?:DROP TABLE|DELETE|UPDATE|TRUNCATE|INSERT)\b/im);
  });
});
