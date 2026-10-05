# Deployment and environment operations

This document describes the repository contract; it is not authorization to deploy or connect to an external service.

## Local

Run Next.js and, optionally, a disposable local PostgreSQL database. Use `.env`, never hosted or fixtures credentials. The offline validation gate does not require a database or provider access.

## Fixtures

Fixtures is a synthetic, database-backed verification environment with credentials in ignored `.env.fixtures.local`. It is used only by explicitly selected fixture suites and operator scripts. It is not a fallback development database and must not be confused with production.

## Production

Production is the customer-sensitive hosted environment. The current external deployment and migration state was not queried during this handoff. Before any production release, verify state through approved read-only channels; do not extrapolate from `.vercel/`, local env files, or historical reports.

## Platform roles

- **Vercel:** hosts the Next.js application and supplies runtime configuration/secrets.
- **Neon/Postgres:** persists application, identity, reconciliation, evidence, and audit-domain data. Runtime generally uses a pooled URL; migrations require a direct/unpooled connection.
- **Resend:** optional email delivery for notifications and pilot magic links.
- **WhatsApp Cloud API:** optional payment/reminder/evidence transport.
- **OpenAI:** optional server-side statement parsing and Agent model provider. The deterministic/offline core does not require it.

## Safe release outline

1. Start from a reviewed, clean commit with lint, typecheck, offline tests, Prisma generate/validate, and build passing.
2. Review schema changes and SQL migrations. Establish the target's actual migration state with the authorized read-only preflight.
3. Prepare backup/recovery and rollback plans. Obtain explicit approval for the exact target, commit, migration set, and window.
4. Run migrations through the guarded workflow using the direct connection. Never use `db push` as a production shortcut.
5. Deploy the exact reviewed commit through the approved platform workflow.
6. Verify health and critical read paths without exposing data or secrets. Authorize any real email/WhatsApp smoke separately.

## Never casually touch

- Production or fixture database credentials and migrations
- Vercel project linkage or environment variables
- Neon projects, branches, roles, or connection strings
- Pilot access/session secrets
- Resend, WhatsApp, webhook, or OpenAI credentials
- Customer statements, evidence, exports, or operational records
