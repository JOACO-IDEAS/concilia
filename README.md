# ConcilIA

ConcilIA is an operational SaaS layer for property and consortium administrators. It does not aim to replace an administrator's ERP. It sits above existing systems and turns bank movements, payment evidence, obligations, units, and payer identity into explainable operational decisions and an exception queue.

```text
source data → ingestion → evidence → candidates → explainable scoring/resolution
            → reconciliation → human exceptions → operational history
```

The product is designed to automate what can be supported by evidence and ask a person for help when the case is genuinely ambiguous. Suggestions, evidence, and confirmed financial facts remain distinct.

## Current status

### Implemented

- Next.js application with organization-scoped operational views and pilot access controls.
- PostgreSQL/Prisma domain for administrators, organizations, units, obligations, payments, evidence, payer identity, reconciliation history, and agent conversations.
- Payment webhook ingestion, bank-statement/document parsing, candidate generation, deterministic/explainable scoring, shadow matching, and human review.
- Payment-evidence intake/extraction/correlation, payer signals and payer/unit associations, unknown-payer resolution, and append-only learning/audit events.
- Read-only ConcilIA Agent tools for operational lookup and document search, with an optional server-side model provider.
- Optional email and WhatsApp adapters that remain inactive without server credentials.

### Validated

- The default test command is an offline suite that explicitly excludes database-backed fixture tests.
- Prisma Safety classifies known fixture and production targets and aborts risky commands on missing, unknown, or mismatched targets.
- Lint, typecheck, offline tests, Prisma generate/validate, and a localhost-only production build are the normal repository gate.

### Experimental

- AI-assisted statement parsing and the model-backed Agent path.
- Calibration, supervised recommendations, shadow matching, and human-confirmation learning.
- Development product-observability storage, which is intentionally in-memory and disabled as durable production history.

### Planned

- A controlled production migration/release workflow based on an explicitly verified target.
- Durable product-event observability and continued reduction of human touch without weakening review or auditability.
- Further integration hardening and productization of the operational agent.

See [current state](docs/CURRENT_STATE.md) and the [technical handoff](docs/TECHNICAL_HANDOFF.md) before planning work.

## Stack

- Node.js 20.9+ and npm
- Next.js 16, React 19, TypeScript, Tailwind CSS
- Prisma 7 with PostgreSQL (Neon is used by hosted environments)
- Vitest and ESLint
- Optional Resend, WhatsApp Cloud API, and OpenAI integrations

## Repository map

| Path | Purpose |
|---|---|
| `src/app/` | App Router pages, server actions, and API routes |
| `src/lib/` | Domain, ingestion, evidence, identity, reconciliation, auth, and agent modules |
| `prisma/` | Schema, migrations, and seed entrypoint |
| `scripts/prisma-safety/` | Environment detection, read-only preflight, and fixture migration wrapper |
| `scripts/test-safety/` | Offline-suite isolation gate |
| `docs/` | Canonical product, architecture, setup, security, deployment, roadmap, and handoff docs |
| `RELEASE_CHECKPOINT_4_3A.md` | Historical release snapshot; not current environment truth |
| `PRODUCT_OBSERVABILITY_CONTRACT.md` | Current scoped contract for product-event observability |

The showroom/demo is a separate codebase and is intentionally not included here.

## Quickstart

```bash
npm ci
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`. A database is not needed to inspect the repository, run static checks, or execute the offline suite. Database-backed screens require a disposable local PostgreSQL database configured in `.env`; never substitute a production URL.

Full setup: [docs/SETUP.md](docs/SETUP.md).

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run db:generate
npm run db:validate
npm run build
```

`npm test` is deliberately offline. Do not run `npm run test:fixtures`, migration commands, seeds, email/WhatsApp sends, or external-provider tests without understanding and authorizing their target.

## Documentation

- [Product](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Current state](docs/CURRENT_STATE.md)
- [Setup](docs/SETUP.md)
- [Security and migration safety](docs/SECURITY.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Roadmap](docs/ROADMAP.md)
- [Technical handoff](docs/TECHNICAL_HANDOFF.md)
- [Agent instructions](AGENTS.md)

## Security

Local environment files, production credentials, fixture credentials, customer exports, and provider tokens must never enter Git. Only `.env.example` is tracked. Production access and every mutating production operation require explicit human authorization and the fail-closed Prisma Safety workflow.
