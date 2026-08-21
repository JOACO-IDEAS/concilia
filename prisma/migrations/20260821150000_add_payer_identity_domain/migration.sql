CREATE TYPE "PayerStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "PayerProvenanceSource" AS ENUM ('HUMAN_REVIEW', 'IMPORT', 'SYSTEM_OBSERVATION');
CREATE TYPE "PayerIdentitySignalType" AS ENUM ('PHONE', 'WHATSAPP', 'BANK_ACCOUNT', 'BANK_ALIAS', 'BANK_PAYER_NAME', 'TAX_ID', 'EMAIL', 'TRANSFER_IDENTIFIER', 'OTHER');

CREATE TABLE "payers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "displayName" TEXT,
    "status" "PayerStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "PayerProvenanceSource" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payer_identity_signals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payerId" TEXT,
    "type" "PayerIdentitySignalType" NOT NULL,
    "normalizedFingerprint" TEXT NOT NULL,
    "maskedValue" TEXT NOT NULL,
    "source" "PayerProvenanceSource" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payer_identity_signals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payers_organizationId_status_idx" ON "payers"("organizationId", "status");
CREATE INDEX "payers_createdBy_idx" ON "payers"("createdBy");
CREATE UNIQUE INDEX "payer_identity_signals_organizationId_type_fingerprint_key" ON "payer_identity_signals"("organizationId", "type", "normalizedFingerprint");
CREATE INDEX "payer_identity_signals_organizationId_payerId_idx" ON "payer_identity_signals"("organizationId", "payerId");
CREATE INDEX "payer_identity_signals_createdBy_idx" ON "payer_identity_signals"("createdBy");

ALTER TABLE "payers" ADD CONSTRAINT "payers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payers" ADD CONSTRAINT "payers_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "administrators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payer_identity_signals" ADD CONSTRAINT "payer_identity_signals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payer_identity_signals" ADD CONSTRAINT "payer_identity_signals_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "payers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payer_identity_signals" ADD CONSTRAINT "payer_identity_signals_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "administrators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
