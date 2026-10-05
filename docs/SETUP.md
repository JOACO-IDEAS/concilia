# Local setup

## Prerequisites

- Node.js 20.9 or newer
- npm (the committed `package-lock.json` is authoritative)
- Optional: PostgreSQL for database-backed development

## Install and start

```bash
npm ci
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`. Keep the safe localhost values in `.env` unless you intentionally provision a disposable local database. No production credential is required to inspect, test, typecheck, or build the project.

## Local database

Create a disposable PostgreSQL database matching the localhost URL in `.env`. The normal application runtime reads `DATABASE_URL`. Prisma CLI migration work prefers `DIRECT_URL`, then `DATABASE_URL_UNPOOLED`, then `DATABASE_URL`.

Do not point local development at fixtures or production. Do not run migrations merely to inspect the repository.

For a new disposable local database, the checked-in Prisma Safety classifier currently recognizes only the known fixtures and production endpoints for risky CLI commands. That means risky commands against an arbitrary localhost URL fail closed. A deliberate local-database workflow should be added and tested before using Prisma migration commands locally; do not bypass the guard ad hoc.

## Safe validation

```bash
npm run lint
npm run typecheck
npm test
npm run db:generate
npm run db:validate
npm run build
```

`npm test` first checks that database-backed fixture suites cannot leak into offline discovery. It then runs the offline Vitest suite with database URLs blanked.

## Database-backed fixture tests

`npm run test:fixtures` connects to the fixtures database and is not part of ordinary setup. Before using it:

1. obtain explicit authorization;
2. confirm ignored `.env.fixtures.local` credentials are provisioned through the approved channel;
3. run the read-only fixtures preflight;
4. understand whether the chosen test/script writes or cleans data.

Production is never a test target.

## Prisma commands

```bash
npm run db:generate   # safe; no database connection
npm run db:validate   # safe; validates schema/config
```

`npm run db:migrate:deploy`, `npm run db:seed`, and `npm run db:studio` are side-effecting and protected by Prisma Safety. See [SECURITY.md](SECURITY.md) before considering them.

## Troubleshooting

- **Database-backed pages are empty/unavailable:** verify only your disposable local `DATABASE_URL`; do not borrow another environment's URL.
- **Prisma command aborts:** read the safety message. Do not bypass an unknown/mismatched target.
- **Generated client missing:** run `npm run db:generate`.
- **Offline test safety fails:** a fixture suite may have been renamed or collected incorrectly; fix isolation before running tests.
- **Integration inactive:** Resend, WhatsApp, and OpenAI are optional and intentionally inactive without server-only credentials.
- **Framework uncertainty:** consult the installed Next.js docs under `node_modules/next/dist/docs/` as required by `AGENTS.md`.
