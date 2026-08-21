CREATE TYPE "PaymentEvidenceIntakeSource" AS ENUM ('WEB_UPLOAD', 'WHATSAPP', 'EMAIL', 'API', 'OTHER');
CREATE TYPE "PaymentEvidenceIntakeType" AS ENUM ('IMAGE', 'PDF', 'TEXT', 'STRUCTURED_DATA');
CREATE TYPE "PaymentEvidenceIntakeState" AS ENUM ('RECEIVED');

CREATE TABLE "payment_evidence_intakes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" "PaymentEvidenceIntakeSource" NOT NULL,
    "evidenceType" "PaymentEvidenceIntakeType" NOT NULL,
    "state" "PaymentEvidenceIntakeState" NOT NULL DEFAULT 'RECEIVED',
    "externalReference" TEXT,
    "storageReference" TEXT,
    "declaredMimeType" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "receivedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_evidence_intakes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_evidence_intakes_organizationId_source_externalReference_key"
ON "payment_evidence_intakes"("organizationId", "source", "externalReference");
CREATE INDEX "payment_evidence_intakes_organizationId_state_receivedAt_idx"
ON "payment_evidence_intakes"("organizationId", "state", "receivedAt");
CREATE INDEX "payment_evidence_intakes_receivedBy_idx" ON "payment_evidence_intakes"("receivedBy");

ALTER TABLE "payment_evidence_intakes"
ADD CONSTRAINT "payment_evidence_intakes_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_evidence_intakes"
ADD CONSTRAINT "payment_evidence_intakes_receivedBy_fkey"
FOREIGN KEY ("receivedBy") REFERENCES "administrators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
