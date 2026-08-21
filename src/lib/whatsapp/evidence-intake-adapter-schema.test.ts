import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20260822003000_add_whatsapp_channel_connections/migration.sql"), "utf8");

describe("WhatsApp inbound channel mapping", () => {
  it("is tenant-scoped and stores no secrets or customer phone data", () => {
    const model = schema.match(/model WhatsAppChannelConnection \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(model).toContain("@@unique([provider, externalChannelReference])");
    expect(model).toContain("organizationId");
    expect(model).not.toMatch(/token|secret|password|sender|phone|payload/i);
  });

  it("uses an additive local migration", () => {
    expect(migration).toContain('CREATE TABLE "whatsapp_channel_connections"');
    expect(migration).not.toMatch(/^\s*(?:DROP|DELETE|UPDATE|TRUNCATE|INSERT|ALTER\s+TABLE.+DROP)\b/im);
  });
});
