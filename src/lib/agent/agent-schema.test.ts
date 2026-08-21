import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20260822020000_add_concilia_agent_foundation/migration.sql"), "utf8");

describe("ConcilIA Agent persistence schema", () => {
  it("keeps conversations and messages tenant-scoped without arbitrary JSON", () => {
    const conversation = schema.match(/model AgentConversation \{[\s\S]*?\n\}/)?.[0] ?? "";
    const message = schema.match(/model AgentMessage \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(conversation).toMatch(/organizationId[\s\S]*administratorId/);
    expect(message).toContain("organizationId");
    expect(message).toContain("fields: [conversationId, organizationId]");
    expect(`${conversation}${message}`).not.toMatch(/Json|toolPayload|providerResponse|systemPrompt/i);
  });

  it("uses an additive local migration with restrictive historical foreign keys", () => {
    expect(migration).toContain('CREATE TABLE "agent_conversations"');
    expect(migration).toContain('CREATE TABLE "agent_messages"');
    expect(migration.match(/ON DELETE RESTRICT/g)).toHaveLength(4);
    expect(migration).not.toMatch(/^\s*(?:DROP|DELETE|UPDATE|TRUNCATE|INSERT)\b/im);
  });
});
