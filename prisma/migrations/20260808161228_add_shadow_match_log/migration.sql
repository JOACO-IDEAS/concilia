-- CreateEnum
CREATE TYPE "ShadowMatchStatus" AS ENUM ('CANDIDATE', 'AMBIGUOUS', 'BLOCKED');

-- CreateTable
CREATE TABLE "shadow_match_logs" (
    "id" TEXT NOT NULL,
    "paymentTransactionId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "candidateUnitId" TEXT,
    "candidateUnitOwnerId" TEXT,
    "candidateObligationId" TEXT,
    "score" INTEGER NOT NULL,
    "tier" INTEGER,
    "status" "ShadowMatchStatus" NOT NULL,
    "signals" JSONB NOT NULL,
    "blockers" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shadow_match_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shadow_match_logs_paymentTransactionId_idx" ON "shadow_match_logs"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "shadow_match_logs_status_idx" ON "shadow_match_logs"("status");

-- CreateIndex
CREATE INDEX "shadow_match_logs_engineVersion_idx" ON "shadow_match_logs"("engineVersion");

-- CreateIndex
CREATE UNIQUE INDEX "shadow_match_logs_paymentTransactionId_engineVersion_key" ON "shadow_match_logs"("paymentTransactionId", "engineVersion");

-- AddForeignKey
ALTER TABLE "shadow_match_logs" ADD CONSTRAINT "shadow_match_logs_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "payment_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shadow_match_logs" ADD CONSTRAINT "shadow_match_logs_candidateUnitId_fkey" FOREIGN KEY ("candidateUnitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shadow_match_logs" ADD CONSTRAINT "shadow_match_logs_candidateUnitOwnerId_fkey" FOREIGN KEY ("candidateUnitOwnerId") REFERENCES "unit_owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shadow_match_logs" ADD CONSTRAINT "shadow_match_logs_candidateObligationId_fkey" FOREIGN KEY ("candidateObligationId") REFERENCES "obligations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
