CREATE TYPE "PaymentEvidenceCorrelationStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED');
CREATE TYPE "PaymentEvidenceCorrelationSource" AS ENUM ('SYSTEM_EVIDENCE', 'HUMAN_REVIEW');

CREATE TABLE "payment_evidence_correlations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentNoticeId" TEXT NOT NULL,
    "paymentTransactionId" TEXT NOT NULL,
    "status" "PaymentEvidenceCorrelationStatus" NOT NULL,
    "source" "PaymentEvidenceCorrelationSource" NOT NULL,
    "confidence" INTEGER,
    "evidenceAssessmentLogId" TEXT,
    "reason" TEXT NOT NULL,
    "decidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_evidence_correlations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_evidence_correlations_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 99))
);

CREATE UNIQUE INDEX "payment_evidence_correlations_notice_transaction_status_key"
    ON "payment_evidence_correlations"("paymentNoticeId", "paymentTransactionId", "status");
CREATE UNIQUE INDEX "payment_evidence_correlations_one_confirmed_notice_key"
    ON "payment_evidence_correlations"("paymentNoticeId") WHERE "status" = 'CONFIRMED';
CREATE INDEX "payment_evidence_correlations_organizationId_idx" ON "payment_evidence_correlations"("organizationId");
CREATE INDEX "payment_evidence_correlations_paymentTransactionId_idx" ON "payment_evidence_correlations"("paymentTransactionId");
CREATE INDEX "payment_evidence_correlations_paymentNoticeId_status_idx" ON "payment_evidence_correlations"("paymentNoticeId", "status");
CREATE INDEX "payment_evidence_correlations_evidenceAssessmentLogId_idx" ON "payment_evidence_correlations"("evidenceAssessmentLogId");
CREATE INDEX "payment_evidence_correlations_decidedBy_idx" ON "payment_evidence_correlations"("decidedBy");

ALTER TABLE "payment_evidence_correlations" ADD CONSTRAINT "payment_evidence_correlations_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_evidence_correlations" ADD CONSTRAINT "payment_evidence_correlations_paymentNoticeId_fkey"
    FOREIGN KEY ("paymentNoticeId") REFERENCES "payment_notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_evidence_correlations" ADD CONSTRAINT "payment_evidence_correlations_paymentTransactionId_fkey"
    FOREIGN KEY ("paymentTransactionId") REFERENCES "payment_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_evidence_correlations" ADD CONSTRAINT "payment_evidence_correlations_evidenceAssessmentLogId_fkey"
    FOREIGN KEY ("evidenceAssessmentLogId") REFERENCES "payment_evidence_assessment_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_evidence_correlations" ADD CONSTRAINT "payment_evidence_correlations_decidedBy_fkey"
    FOREIGN KEY ("decidedBy") REFERENCES "administrators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
