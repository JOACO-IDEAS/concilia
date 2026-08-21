CREATE TYPE "AgentConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "AgentMessageRole" AS ENUM ('USER', 'ASSISTANT');

CREATE TABLE "agent_conversations" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "administratorId" TEXT NOT NULL,
  "title" TEXT,
  "status" "AgentConversationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_messages" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "role" "AgentMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_conversations_id_organizationId_key" ON "agent_conversations"("id", "organizationId");
CREATE INDEX "agent_conversations_administratorId_organizationId_status_updatedAt_idx" ON "agent_conversations"("administratorId", "organizationId", "status", "updatedAt");
CREATE INDEX "agent_messages_conversationId_createdAt_idx" ON "agent_messages"("conversationId", "createdAt");
CREATE INDEX "agent_messages_organizationId_createdAt_idx" ON "agent_messages"("organizationId", "createdAt");

ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "administrators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_conversationId_organizationId_fkey" FOREIGN KEY ("conversationId", "organizationId") REFERENCES "agent_conversations"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
