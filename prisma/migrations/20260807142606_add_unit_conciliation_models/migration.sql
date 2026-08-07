-- CreateEnum
CREATE TYPE "UnitOccupantType" AS ENUM ('OWNER', 'TENANT');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReconciliationDecision" AS ENUM ('AUTO', 'SUGGESTED', 'APPROVED', 'REJECTED', 'EXCEPTION');

-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN     "unitId" TEXT;

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "coefficient" DECIMAL(6,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_owners" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "taxId" TEXT,
    "relationship" "UnitOccupantType" NOT NULL DEFAULT 'OWNER',
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "unit_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obligations" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "ObligationStatus" NOT NULL DEFAULT 'PENDING',
    "concept" TEXT,
    "dueDate" TIMESTAMP(3),
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_matches" (
    "id" TEXT NOT NULL,
    "paymentTransactionId" TEXT NOT NULL,
    "unitId" TEXT,
    "obligationId" TEXT,
    "decision" "ReconciliationDecision" NOT NULL,
    "score" INTEGER,
    "signals" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "decidedBy" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "units_organizationId_idx" ON "units"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "units_organizationId_code_key" ON "units"("organizationId", "code");

-- CreateIndex
CREATE INDEX "unit_owners_unitId_idx" ON "unit_owners"("unitId");

-- CreateIndex
CREATE INDEX "unit_owners_taxId_idx" ON "unit_owners"("taxId");

-- CreateIndex
CREATE UNIQUE INDEX "unit_owners_unitId_taxId_key" ON "unit_owners"("unitId", "taxId");

-- CreateIndex
CREATE INDEX "obligations_unitId_status_idx" ON "obligations"("unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "obligations_unitId_period_key" ON "obligations"("unitId", "period");

-- CreateIndex
CREATE INDEX "reconciliation_matches_paymentTransactionId_createdAt_idx" ON "reconciliation_matches"("paymentTransactionId", "createdAt");

-- CreateIndex
CREATE INDEX "reconciliation_matches_unitId_idx" ON "reconciliation_matches"("unitId");

-- CreateIndex
CREATE INDEX "reconciliation_matches_obligationId_idx" ON "reconciliation_matches"("obligationId");

-- CreateIndex
CREATE INDEX "reconciliation_matches_decision_idx" ON "reconciliation_matches"("decision");

-- CreateIndex
CREATE INDEX "payment_transactions_unitId_idx" ON "payment_transactions"("unitId");

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_owners" ADD CONSTRAINT "unit_owners_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "payment_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "obligations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
