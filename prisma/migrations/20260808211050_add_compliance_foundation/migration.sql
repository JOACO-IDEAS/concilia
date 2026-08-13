-- CreateEnum
CREATE TYPE "RegulatoryRequirementScope" AS ENUM ('ADMINISTRATOR', 'PROVIDER', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "RegulatoryRequirementType" AS ENUM ('INSCRIPCION', 'DOCUMENTACION_PROVEEDOR', 'DDJJ_ANUAL', 'CAPACITACION', 'LIQUIDACION_EXPENSAS', 'OTRO');

-- CreateEnum
CREATE TYPE "ProviderDocumentType" AS ENUM ('ART', 'RC', 'MATRICULA', 'AFIP', 'ANSES', 'OTRO');

-- CreateEnum
CREATE TYPE "ProviderDocumentStatus" AS ENUM ('PENDING_REVIEW', 'ACTIVE', 'SUPERSEDED', 'REJECTED');

-- CreateTable
CREATE TABLE "regulatory_requirements" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "jurisdiccion" TEXT NOT NULL,
    "norma" TEXT NOT NULL,
    "articulo" TEXT,
    "descripcion" TEXT NOT NULL,
    "tipo" "RegulatoryRequirementType" NOT NULL,
    "alcance" "RegulatoryRequirementScope" NOT NULL,
    "documentacionEsperada" TEXT,
    "vigenteDesde" TIMESTAMP(3),
    "vigenteHasta" TIMESTAMP(3),
    "fuenteNombre" TEXT,
    "fuenteUrl" TEXT NOT NULL,
    "fuenteTexto" TEXT,
    "ultimaVerificacion" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regulatory_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "matricula" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_organizations" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_documents" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "requirementId" TEXT,
    "type" "ProviderDocumentType" NOT NULL,
    "status" "ProviderDocumentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "documentNumber" TEXT,
    "issuedAt" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "evidenceUrl" TEXT,
    "extractedByAI" BOOLEAN NOT NULL DEFAULT false,
    "verifiedByHuman" BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy" TEXT,
    "previousDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "provider_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regulatory_requirements_supersedesId_key" ON "regulatory_requirements"("supersedesId");

-- CreateIndex
CREATE INDEX "regulatory_requirements_alcance_idx" ON "regulatory_requirements"("alcance");

-- CreateIndex
CREATE INDEX "regulatory_requirements_tipo_idx" ON "regulatory_requirements"("tipo");

-- CreateIndex
CREATE INDEX "regulatory_requirements_jurisdiccion_idx" ON "regulatory_requirements"("jurisdiccion");

-- CreateIndex
CREATE UNIQUE INDEX "providers_taxId_key" ON "providers"("taxId");

-- CreateIndex
CREATE INDEX "provider_organizations_organizationId_idx" ON "provider_organizations"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_organizations_providerId_organizationId_key" ON "provider_organizations"("providerId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_documents_previousDocumentId_key" ON "provider_documents"("previousDocumentId");

-- CreateIndex
CREATE INDEX "provider_documents_providerId_idx" ON "provider_documents"("providerId");

-- CreateIndex
CREATE INDEX "provider_documents_organizationId_idx" ON "provider_documents"("organizationId");

-- CreateIndex
CREATE INDEX "provider_documents_type_idx" ON "provider_documents"("type");

-- CreateIndex
CREATE INDEX "provider_documents_validTo_idx" ON "provider_documents"("validTo");

-- CreateIndex
CREATE INDEX "provider_documents_requirementId_idx" ON "provider_documents"("requirementId");

-- AddForeignKey
ALTER TABLE "regulatory_requirements" ADD CONSTRAINT "regulatory_requirements_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "regulatory_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_organizations" ADD CONSTRAINT "provider_organizations_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_organizations" ADD CONSTRAINT "provider_organizations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_documents" ADD CONSTRAINT "provider_documents_previousDocumentId_fkey" FOREIGN KEY ("previousDocumentId") REFERENCES "provider_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_documents" ADD CONSTRAINT "provider_documents_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_documents" ADD CONSTRAINT "provider_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_documents" ADD CONSTRAINT "provider_documents_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "regulatory_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
