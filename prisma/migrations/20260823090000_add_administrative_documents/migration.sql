CREATE TYPE "AdministrativeDocumentType" AS ENUM ('INVOICE', 'CONTRACT', 'RECEIPT', 'STATEMENT', 'OTHER');
CREATE TYPE "AdministrativeDocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "administrative_documents" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "providerId" TEXT,
  "createdByAdministratorId" TEXT,
  "type" "AdministrativeDocumentType" NOT NULL,
  "status" "AdministrativeDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
  "title" TEXT NOT NULL,
  "period" TIMESTAMP(3),
  "issuedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "amount" DECIMAL(14,2),
  "currency" TEXT,
  "storageReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "administrative_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "administrative_documents_organizationId_type_period_idx" ON "administrative_documents"("organizationId", "type", "period");
CREATE INDEX "administrative_documents_organizationId_expiresAt_idx" ON "administrative_documents"("organizationId", "expiresAt");
CREATE INDEX "administrative_documents_organizationId_providerId_idx" ON "administrative_documents"("organizationId", "providerId");
ALTER TABLE "administrative_documents" ADD CONSTRAINT "administrative_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "administrative_documents" ADD CONSTRAINT "administrative_documents_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "administrative_documents" ADD CONSTRAINT "administrative_documents_createdByAdministratorId_fkey" FOREIGN KEY ("createdByAdministratorId") REFERENCES "administrators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
