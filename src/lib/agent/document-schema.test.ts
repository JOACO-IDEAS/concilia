import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("administrative document persistence contract", () => {
  it("is additive, tenant scoped and keeps storage opaque", () => {
    const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
    const migration = readFileSync(new URL("../../../prisma/migrations/20260823090000_add_administrative_documents/migration.sql", import.meta.url), "utf8");
    expect(schema).toMatch(/model AdministrativeDocument[\s\S]*organizationId\s+String[\s\S]*storageReference\s+String\?/);
    expect(schema).toMatch(/organization\s+Organization\s+@relation\([^\n]*onDelete: Restrict/);
    expect(migration).toContain('CREATE TABLE "administrative_documents"');
    expect(`${schema}\n${migration}`).not.toMatch(/PaymentEvidenceIntake.*AdministrativeDocument|https?:\/\//);
  });
});
