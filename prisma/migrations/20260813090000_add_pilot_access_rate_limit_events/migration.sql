CREATE TYPE "PilotAccessRateLimitScope" AS ENUM ('ISSUE_EMAIL', 'ISSUE_IP', 'CONSUME_TOKEN', 'CONSUME_IP');

CREATE TABLE "pilot_access_rate_limit_events" (
    "id" TEXT NOT NULL,
    "scope" "PilotAccessRateLimitScope" NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pilot_access_rate_limit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pilot_access_rate_limit_events_scope_subjectKey_createdAt_idx"
    ON "pilot_access_rate_limit_events"("scope", "subjectKey", "createdAt");

CREATE INDEX "pilot_access_rate_limit_events_createdAt_idx"
    ON "pilot_access_rate_limit_events"("createdAt");
