# Architecture

## Runtime

ConcilIA is a Next.js App Router application. Server actions and route handlers call domain modules under `src/lib/`; Prisma 7 uses the PostgreSQL driver adapter at runtime. Hosted deployments are designed for Vercel with Neon/Postgres, while optional providers handle email, WhatsApp, and model-backed parsing/agent responses.

```text
browser
  → Next.js pages / server actions / API routes
    → auth and organization access gates
      → ingestion and domain services
        → Prisma adapter → PostgreSQL
        → optional Resend / WhatsApp / OpenAI adapters
```

## Core domains

- `auth/`: bootstrap and magic-link access, signed sessions, durable pilot rate limiting, organization/resource authorization.
- `payments/` and `statements/`: verified payment webhook payloads, statement parsing, payment creation, and initial matching.
- `documents/`: CSV, XLSX, and PDF extraction using tracked synthetic fixtures.
- `reconciliation/`: candidate generation, deterministic matching, explainable signals/confidence, shadow runs, review queues, observations, and human decisions.
- `payment-evidence/`: immutable intake, extraction runs/facts, correlations to bank transactions, evidence scoring, and identity resolution.
- `payer-identity/`: payers, identity signals, historical recognition, payer/unit memory, contradictory evidence, unknown-payer resolution, and human-confirmation learning.
- `agent-os/` and `agent/`: operational summaries/queues plus persisted conversations and allowlisted read-only capabilities. Model-backed orchestration is optional.
- `calibration/`: datasets, ground truth, disagreement, metrics, threshold simulation, and recommendation logic; it does not authorize autonomous reconciliation.
- `product-observability/`: allowlisted event contracts and a development-only in-memory store.

## Reconciliation flow

1. A bank transaction, statement row, or payment notice is ingested.
2. Evidence is normalized without conflating a document with confirmed money.
3. Candidate organizations/units are generated from deterministic signals.
4. The confidence engine records explainable evidence and a proposed status.
5. Unambiguous supported flows may follow their explicit code contract; ambiguous cases enter human review.
6. Approval/rejection creates decision and evidence history rather than erasing the proposal.
7. Confirmed human outcomes can add payer identity and payer/unit evidence for future recognition.

## Data and audit invariants

- Session → administrator → organization → resource is the authorization chain.
- Never trust a client-supplied organization ID without server-side membership verification.
- Payment-evidence intake is immutable; processing belongs in separate extraction/fact records.
- Reconciliation decisions and payer/unit evidence preserve provenance and contradictory/revoked states.
- Rate-limit subjects are stored as domain-separated HMACs, not raw identifiers.
- Optional integrations fail closed or degrade to non-sending/non-model behavior as defined by their module.

## Database and migrations

`prisma/schema.prisma` is the data-model source. Ordered SQL migrations live under `prisma/migrations/`. Runtime queries use `DATABASE_URL`; CLI migration work prefers `DIRECT_URL`, then `DATABASE_URL_UNPOOLED`, then `DATABASE_URL`.

`prisma.config.ts` invokes the same environment classifier as the read-only preflight. Risky Prisma commands require `PRISMA_TARGET_ENV=fixtures|production` and an exact known-host match. This guard reduces risk; it never substitutes for human authorization.
