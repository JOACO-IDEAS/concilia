ALTER TABLE "payment_evidence_correlations" ALTER COLUMN "paymentNoticeId" DROP NOT NULL;
ALTER TABLE "payment_evidence_correlations" ADD COLUMN "extractionRunId" TEXT;

CREATE UNIQUE INDEX "payment_evidence_correlations_extractionRunId_paymentTransactionId_status_key"
ON "payment_evidence_correlations"("extractionRunId", "paymentTransactionId", "status");
CREATE INDEX "payment_evidence_correlations_extractionRunId_idx"
ON "payment_evidence_correlations"("extractionRunId");

ALTER TABLE "payment_evidence_correlations"
ADD CONSTRAINT "payment_evidence_correlations_extractionRunId_fkey"
FOREIGN KEY ("extractionRunId") REFERENCES "payment_evidence_extraction_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_evidence_correlations"
ADD CONSTRAINT "payment_evidence_correlations_exactly_one_provenance_check"
CHECK (("paymentNoticeId" IS NOT NULL)::int + ("extractionRunId" IS NOT NULL)::int = 1);
