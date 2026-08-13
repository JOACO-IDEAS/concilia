-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AgentObservationType" ADD VALUE 'PAYMENT_MATCH_BLOCKED';
ALTER TYPE "AgentObservationType" ADD VALUE 'PAYMENT_MATCH_AMBIGUOUS';

-- AlterEnum
ALTER TYPE "AgentType" ADD VALUE 'MATCHING';

-- AlterTable
ALTER TABLE "agent_observations" ADD COLUMN     "paymentTransactionId" TEXT;

-- CreateIndex
CREATE INDEX "agent_observations_paymentTransactionId_idx" ON "agent_observations"("paymentTransactionId");

-- AddForeignKey
ALTER TABLE "agent_observations" ADD CONSTRAINT "agent_observations_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
