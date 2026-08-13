CREATE TABLE "pilot_access_tokens" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pilot_access_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pilot_access_tokens_tokenHash_key" ON "pilot_access_tokens"("tokenHash");
CREATE INDEX "pilot_access_tokens_administratorId_idx" ON "pilot_access_tokens"("administratorId");
CREATE INDEX "pilot_access_tokens_expiresAt_idx" ON "pilot_access_tokens"("expiresAt");
ALTER TABLE "pilot_access_tokens" ADD CONSTRAINT "pilot_access_tokens_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "administrators"("id") ON DELETE CASCADE ON UPDATE CASCADE;
