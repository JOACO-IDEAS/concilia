-- CreateEnum
CREATE TYPE "PaymentEvidenceState" AS ENUM ('INFORMATIONAL', 'NEEDS_DATA', 'NEEDS_DECISION', 'PRE_CONCILIABLE', 'RECONCILIATION_CONFIRMED');

-- CreateTable
CREATE TABLE "payment_evidence_assessment_logs" (
    "id" TEXT NOT NULL,
    "paymentTransactionId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "state" "PaymentEvidenceState" NOT NULL,
    "candidateUnitId" TEXT,
    "families" JSONB NOT NULL,
    "independentFamiliesConverging" JSONB NOT NULL,
    "hasContradiction" BOOLEAN NOT NULL,
    "contradictionDetail" TEXT,
    "explanation" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_evidence_assessment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_evidence_assessment_logs_paymentTransactionId_idx" ON "payment_evidence_assessment_logs"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "payment_evidence_assessment_logs_state_idx" ON "payment_evidence_assessment_logs"("state");

-- CreateIndex
CREATE INDEX "payment_evidence_assessment_logs_candidateUnitId_idx" ON "payment_evidence_assessment_logs"("candidateUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_evidence_assessment_logs_paymentTransactionId_engin_key" ON "payment_evidence_assessment_logs"("paymentTransactionId", "engineVersion");

-- AddForeignKey
ALTER TABLE "payment_evidence_assessment_logs" ADD CONSTRAINT "payment_evidence_assessment_logs_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "payment_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_evidence_assessment_logs" ADD CONSTRAINT "payment_evidence_assessment_logs_candidateUnitId_fkey" FOREIGN KEY ("candidateUnitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
