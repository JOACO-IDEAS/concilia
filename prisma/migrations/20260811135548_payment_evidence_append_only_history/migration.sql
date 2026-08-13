-- DropIndex
DROP INDEX "payment_evidence_assessment_logs_paymentTransactionId_engin_key";

-- AlterTable
ALTER TABLE "payment_evidence_assessment_logs" ADD COLUMN     "structuredEvidence" JSONB;

-- CreateIndex
CREATE INDEX "payment_evidence_assessment_logs_paymentTransactionId_engin_idx" ON "payment_evidence_assessment_logs"("paymentTransactionId", "engineVersion");
