CREATE TYPE "PaymentEvidenceExtractionSource" AS ENUM ('STRUCTURED', 'TEXT', 'EXTERNAL_EXTRACTOR');
CREATE TYPE "PaymentEvidenceExtractionStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'UNSUPPORTED');
CREATE TYPE "PaymentEvidenceFactType" AS ENUM ('AMOUNT', 'DATE', 'OPERATION_REFERENCE', 'BANK_NAME', 'PAYER_DISPLAY_NAME', 'ACCOUNT_IDENTIFIER', 'TRANSFER_REFERENCE');
CREATE TYPE "PaymentEvidenceDateRole" AS ENUM ('OPERATION', 'ISSUED', 'ACCREDITATION', 'UNKNOWN');
CREATE TYPE "PaymentEvidenceAccountType" AS ENUM ('CBU', 'CVU', 'ALIAS', 'ACCOUNT', 'OTHER');

CREATE TABLE "payment_evidence_extraction_runs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "intakeId" TEXT NOT NULL,
  "source" "PaymentEvidenceExtractionSource" NOT NULL,
  "extractor" TEXT NOT NULL,
  "extractorVersion" TEXT NOT NULL,
  "status" "PaymentEvidenceExtractionStatus" NOT NULL,
  "errorCode" TEXT,
  "extractedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_evidence_extraction_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_evidence_facts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "extractionRunId" TEXT NOT NULL,
  "type" "PaymentEvidenceFactType" NOT NULL,
  "normalizedValue" TEXT,
  "numericValue" DECIMAL(14,2),
  "dateValue" TIMESTAMP(3),
  "currency" TEXT,
  "dateRole" "PaymentEvidenceDateRole",
  "accountType" "PaymentEvidenceAccountType",
  "normalizedFingerprint" TEXT,
  "maskedValue" TEXT,
  "confidence" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_evidence_facts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_evidence_extraction_runs_organizationId_intakeId_extractedAt_idx" ON "payment_evidence_extraction_runs"("organizationId", "intakeId", "extractedAt");
CREATE INDEX "payment_evidence_extraction_runs_intakeId_status_idx" ON "payment_evidence_extraction_runs"("intakeId", "status");
CREATE INDEX "payment_evidence_extraction_runs_createdBy_idx" ON "payment_evidence_extraction_runs"("createdBy");
CREATE INDEX "payment_evidence_facts_organizationId_type_idx" ON "payment_evidence_facts"("organizationId", "type");
CREATE INDEX "payment_evidence_facts_extractionRunId_idx" ON "payment_evidence_facts"("extractionRunId");
CREATE INDEX "payment_evidence_facts_organizationId_normalizedFingerprint_idx" ON "payment_evidence_facts"("organizationId", "normalizedFingerprint");

ALTER TABLE "payment_evidence_extraction_runs" ADD CONSTRAINT "payment_evidence_extraction_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_evidence_extraction_runs" ADD CONSTRAINT "payment_evidence_extraction_runs_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "payment_evidence_intakes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_evidence_extraction_runs" ADD CONSTRAINT "payment_evidence_extraction_runs_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "administrators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_evidence_facts" ADD CONSTRAINT "payment_evidence_facts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_evidence_facts" ADD CONSTRAINT "payment_evidence_facts_extractionRunId_fkey" FOREIGN KEY ("extractionRunId") REFERENCES "payment_evidence_extraction_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
