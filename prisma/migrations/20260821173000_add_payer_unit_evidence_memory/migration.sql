CREATE TYPE "PayerUnitAssociationStatus" AS ENUM ('OBSERVED', 'DISPUTED', 'REVOKED');
CREATE TYPE "PayerUnitEvidenceEffect" AS ENUM ('SUPPORT', 'CONTRADICT', 'REVOKE');
CREATE TYPE "PayerUnitEvidenceSource" AS ENUM ('PAYMENT_CONFIRMED', 'HUMAN_CONFIRMATION', 'SYSTEM_OBSERVATION');

CREATE TABLE "payer_unit_associations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payerId" TEXT,
    "signalId" TEXT,
    "unitId" TEXT NOT NULL,
    "status" "PayerUnitAssociationStatus" NOT NULL DEFAULT 'OBSERVED',
    "observationCount" INTEGER NOT NULL DEFAULT 0,
    "supportCount" INTEGER NOT NULL DEFAULT 0,
    "contradictionCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payer_unit_associations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payer_unit_associations_one_subject_check" CHECK (("payerId" IS NOT NULL) <> ("signalId" IS NOT NULL)),
    CONSTRAINT "payer_unit_associations_counts_check" CHECK ("observationCount" >= 0 AND "supportCount" >= 0 AND "contradictionCount" >= 0)
);

CREATE TABLE "payer_unit_evidence_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "associationId" TEXT NOT NULL,
    "effect" "PayerUnitEvidenceEffect" NOT NULL,
    "source" "PayerUnitEvidenceSource" NOT NULL,
    "evidenceKey" TEXT NOT NULL,
    "confidence" INTEGER,
    "paymentEvidenceCorrelationId" TEXT,
    "reconciliationMatchId" TEXT,
    "reason" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payer_unit_evidence_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payer_unit_evidence_events_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 99))
);

CREATE UNIQUE INDEX "payer_unit_associations_payer_unit_key" ON "payer_unit_associations"("organizationId", "payerId", "unitId") WHERE "payerId" IS NOT NULL;
CREATE UNIQUE INDEX "payer_unit_associations_signal_unit_key" ON "payer_unit_associations"("organizationId", "signalId", "unitId") WHERE "signalId" IS NOT NULL;
CREATE INDEX "payer_unit_associations_organizationId_unitId_status_idx" ON "payer_unit_associations"("organizationId", "unitId", "status");
CREATE INDEX "payer_unit_associations_organizationId_payerId_idx" ON "payer_unit_associations"("organizationId", "payerId");
CREATE INDEX "payer_unit_associations_organizationId_signalId_idx" ON "payer_unit_associations"("organizationId", "signalId");
CREATE UNIQUE INDEX "payer_unit_evidence_events_organizationId_evidenceKey_key" ON "payer_unit_evidence_events"("organizationId", "evidenceKey");
CREATE INDEX "payer_unit_evidence_events_associationId_createdAt_idx" ON "payer_unit_evidence_events"("associationId", "createdAt");
CREATE INDEX "payer_unit_evidence_events_organizationId_source_idx" ON "payer_unit_evidence_events"("organizationId", "source");
CREATE INDEX "payer_unit_evidence_events_paymentEvidenceCorrelationId_idx" ON "payer_unit_evidence_events"("paymentEvidenceCorrelationId");
CREATE INDEX "payer_unit_evidence_events_reconciliationMatchId_idx" ON "payer_unit_evidence_events"("reconciliationMatchId");
CREATE INDEX "payer_unit_evidence_events_createdBy_idx" ON "payer_unit_evidence_events"("createdBy");

ALTER TABLE "payer_unit_associations" ADD CONSTRAINT "payer_unit_associations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payer_unit_associations" ADD CONSTRAINT "payer_unit_associations_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "payers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payer_unit_associations" ADD CONSTRAINT "payer_unit_associations_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "payer_identity_signals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payer_unit_associations" ADD CONSTRAINT "payer_unit_associations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payer_unit_evidence_events" ADD CONSTRAINT "payer_unit_evidence_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payer_unit_evidence_events" ADD CONSTRAINT "payer_unit_evidence_events_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "payer_unit_associations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payer_unit_evidence_events" ADD CONSTRAINT "payer_unit_evidence_events_paymentEvidenceCorrelationId_fkey" FOREIGN KEY ("paymentEvidenceCorrelationId") REFERENCES "payment_evidence_correlations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payer_unit_evidence_events" ADD CONSTRAINT "payer_unit_evidence_events_reconciliationMatchId_fkey" FOREIGN KEY ("reconciliationMatchId") REFERENCES "reconciliation_matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payer_unit_evidence_events" ADD CONSTRAINT "payer_unit_evidence_events_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "administrators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
