import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("payer-unit memory schema invariants", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migration = readFileSync(join(process.cwd(), "prisma/migrations/20260821173000_add_payer_unit_evidence_memory/migration.sql"), "utf8");

  it("impone exactamente un sujeto y claves N:M separadas", () => {
    expect(migration).toContain("one_subject_check");
    expect(migration).toContain("payer_unit_associations_payer_unit_key");
    expect(migration).toContain("payer_unit_associations_signal_unit_key");
  });

  it("los eventos son append-only y no contienen columnas PII", () => {
    const event = schema.match(/model PayerUnitEvidenceEvent \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(event).toContain("createdAt");
    expect(event).not.toContain("updatedAt");
    expect(event).not.toMatch(/phone|email|bankAccount|fingerprint|maskedValue/i);
    expect(migration).toContain("payer_unit_evidence_events_associationId_fkey");
    expect(migration).toContain("ON DELETE RESTRICT");
  });

  it("protege confidence e idempotencia en base de datos", () => {
    expect(migration).toContain("confidence_check");
    expect(schema).toContain("@@unique([organizationId, evidenceKey])");
  });
});
