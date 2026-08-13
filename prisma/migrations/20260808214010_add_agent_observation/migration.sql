-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('COMPLIANCE');

-- CreateEnum
CREATE TYPE "AgentObservationType" AS ENUM ('DOCUMENT_EXPIRED', 'DOCUMENT_EXPIRING_SOON', 'PROVIDER_WITHOUT_DOCUMENTS');

-- CreateEnum
CREATE TYPE "AgentObservationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AgentObservationStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "agent_observations" (
    "id" TEXT NOT NULL,
    "agentType" "AgentType" NOT NULL,
    "type" "AgentObservationType" NOT NULL,
    "severity" "AgentObservationSeverity" NOT NULL,
    "status" "AgentObservationStatus" NOT NULL DEFAULT 'OPEN',
    "providerId" TEXT,
    "providerDocumentId" TEXT,
    "organizationId" TEXT,
    "explanation" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "suggestedAction" TEXT,
    "source" TEXT NOT NULL,
    "confidence" INTEGER,
    "dedupeKey" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_observations_dedupeKey_key" ON "agent_observations"("dedupeKey");

-- CreateIndex
CREATE INDEX "agent_observations_agentType_idx" ON "agent_observations"("agentType");

-- CreateIndex
CREATE INDEX "agent_observations_type_idx" ON "agent_observations"("type");

-- CreateIndex
CREATE INDEX "agent_observations_status_idx" ON "agent_observations"("status");

-- CreateIndex
CREATE INDEX "agent_observations_providerId_idx" ON "agent_observations"("providerId");

-- CreateIndex
CREATE INDEX "agent_observations_organizationId_idx" ON "agent_observations"("organizationId");

-- AddForeignKey
ALTER TABLE "agent_observations" ADD CONSTRAINT "agent_observations_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_observations" ADD CONSTRAINT "agent_observations_providerDocumentId_fkey" FOREIGN KEY ("providerDocumentId") REFERENCES "provider_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_observations" ADD CONSTRAINT "agent_observations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
