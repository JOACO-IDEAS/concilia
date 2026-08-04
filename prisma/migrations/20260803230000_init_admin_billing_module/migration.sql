-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ContactChannelType" AS ENUM ('EMAIL', 'PHONE', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ContactChannelPurpose" AS ENUM ('BILLING', 'NOTIFICATIONS', 'GENERAL');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('CBU', 'IBAN', 'ALIAS', 'OTHER');

-- CreateTable
CREATE TABLE "administrators" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "administrators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_administrators" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_administrators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_organizations" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_channels" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT,
    "type" "ContactChannelType" NOT NULL,
    "value" TEXT NOT NULL,
    "purpose" "ContactChannelPurpose" NOT NULL DEFAULT 'GENERAL',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "contact_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taxCondition" TEXT NOT NULL,
    "bankAccountType" "BankAccountType" NOT NULL,
    "bankAccountNumber" TEXT NOT NULL,
    "billingCurrency" TEXT NOT NULL DEFAULT 'ARS',
    "paymentTerms" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "billing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "administrators_email_key" ON "administrators"("email");

-- CreateIndex
CREATE INDEX "administrators_email_idx" ON "administrators"("email");

-- CreateIndex
CREATE INDEX "organization_administrators_organizationId_idx" ON "organization_administrators"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_administrators_administratorId_organizationId_key" ON "organization_administrators"("administratorId", "organizationId");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_taxId_key" ON "organizations"("taxId");

-- CreateIndex
CREATE INDEX "contacts_lastName_firstName_idx" ON "contacts"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "contact_organizations_organizationId_idx" ON "contact_organizations"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_organizations_contactId_organizationId_key" ON "contact_organizations"("contactId", "organizationId");

-- CreateIndex
CREATE INDEX "contact_channels_organizationId_idx" ON "contact_channels"("organizationId");

-- CreateIndex
CREATE INDEX "contact_channels_contactId_idx" ON "contact_channels"("contactId");

-- CreateIndex
CREATE INDEX "contact_channels_value_idx" ON "contact_channels"("value");

-- CreateIndex
CREATE INDEX "contact_channels_organizationId_purpose_idx" ON "contact_channels"("organizationId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "contact_channels_organizationId_type_value_key" ON "contact_channels"("organizationId", "type", "value");

-- CreateIndex
CREATE INDEX "billing_profiles_organizationId_idx" ON "billing_profiles"("organizationId");

-- AddForeignKey
ALTER TABLE "organization_administrators" ADD CONSTRAINT "organization_administrators_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "administrators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_administrators" ADD CONSTRAINT "organization_administrators_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_organizations" ADD CONSTRAINT "contact_organizations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_organizations" ADD CONSTRAINT "contact_organizations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_channels" ADD CONSTRAINT "contact_channels_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_channels" ADD CONSTRAINT "contact_channels_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

