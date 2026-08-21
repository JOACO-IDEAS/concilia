import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20260821223000_add_payment_evidence_extraction_facts/migration.sql"), "utf8");

describe("durable extraction contract", () => {
  it("stores append-only normalized facts without raw evidence or inference columns", () => {
    const run = schema.match(/model PaymentEvidenceExtractionRun \{[\s\S]*?\n\}/)?.[0] ?? "";
    const fact = schema.match(/model PaymentEvidenceFact \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(run).not.toContain("updatedAt"); expect(fact).not.toContain("updatedAt");
    expect(`${run}\n${fact}`).not.toMatch(/rawFragment|rawEvidence|unitId|payerId|obligationId|paymentTransactionId/i);
    expect(fact).toContain("normalizedFingerprint"); expect(fact).toContain("maskedValue");
    expect(`${run}\n${fact}`.match(/onDelete: Restrict/g)).toHaveLength(5);
  });

  it("uses an additive local migration", () => {
    expect(migration).toContain('CREATE TABLE "payment_evidence_extraction_runs"');
    expect(migration).toContain('CREATE TABLE "payment_evidence_facts"');
    expect(migration).not.toMatch(/^\s*(?:DROP|DELETE|UPDATE|TRUNCATE|INSERT)\b/im);
  });
});
