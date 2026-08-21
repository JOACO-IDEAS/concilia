CREATE TYPE "WhatsAppProvider" AS ENUM ('META_CLOUD');
CREATE TYPE "WhatsAppChannelConnectionStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "whatsapp_channel_connections" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "provider" "WhatsAppProvider" NOT NULL,
  "externalChannelReference" TEXT NOT NULL,
  "status" "WhatsAppChannelConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_channel_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_channel_connections_provider_externalChannelReference_key"
ON "whatsapp_channel_connections"("provider", "externalChannelReference");
CREATE INDEX "whatsapp_channel_connections_organizationId_status_idx"
ON "whatsapp_channel_connections"("organizationId", "status");
CREATE INDEX "whatsapp_channel_connections_createdBy_idx"
ON "whatsapp_channel_connections"("createdBy");

ALTER TABLE "whatsapp_channel_connections"
ADD CONSTRAINT "whatsapp_channel_connections_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_channel_connections"
ADD CONSTRAINT "whatsapp_channel_connections_createdBy_fkey"
FOREIGN KEY ("createdBy") REFERENCES "administrators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
