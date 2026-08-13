-- CreateEnum
CREATE TYPE "PaymentNoticeStatus" AS ENUM ('RECEIVED', 'EXTRACTED', 'MATCHED_PENDING', 'LINKED', 'DISCARDED');

-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN     "referenceNumber" TEXT,
ADD COLUMN     "transactionDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "payment_notices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "phone" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(14,2),
    "claimedDate" TIMESTAMP(3),
    "reference" TEXT,
    "attachmentUrl" TEXT,
    "extractedText" TEXT,
    "extractedData" JSONB,
    "status" "PaymentNoticeStatus" NOT NULL DEFAULT 'RECEIVED',
    "linkedPaymentTransactionId" TEXT,
    "linkedUnitId" TEXT,
    "linkedUnitOwnerId" TEXT,
    "confidence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_notices_organizationId_idx" ON "payment_notices"("organizationId");

-- CreateIndex
CREATE INDEX "payment_notices_phone_idx" ON "payment_notices"("phone");

-- CreateIndex
CREATE INDEX "payment_notices_status_idx" ON "payment_notices"("status");

-- CreateIndex
CREATE INDEX "payment_notices_linkedPaymentTransactionId_idx" ON "payment_notices"("linkedPaymentTransactionId");

-- CreateIndex
CREATE INDEX "unit_owners_phone_idx" ON "unit_owners"("phone");

-- AddForeignKey
ALTER TABLE "payment_notices" ADD CONSTRAINT "payment_notices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_notices" ADD CONSTRAINT "payment_notices_linkedPaymentTransactionId_fkey" FOREIGN KEY ("linkedPaymentTransactionId") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_notices" ADD CONSTRAINT "payment_notices_linkedUnitId_fkey" FOREIGN KEY ("linkedUnitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_notices" ADD CONSTRAINT "payment_notices_linkedUnitOwnerId_fkey" FOREIGN KEY ("linkedUnitOwnerId") REFERENCES "unit_owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
