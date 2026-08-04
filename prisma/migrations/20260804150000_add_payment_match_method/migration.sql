-- CreateEnum
CREATE TYPE "PaymentMatchMethod" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN "matchMethod" "PaymentMatchMethod";
