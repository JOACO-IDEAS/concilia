# Technical handoff

## 1. What works today?

The core Next.js/Prisma application implements organization-scoped operational views, pilot access, payment/document ingestion, explainable reconciliation, human review, evidence and payer-identity memory, delinquency/import workflows, and a read-oriented operational Agent. Optional email, WhatsApp, and model providers are isolated behind server-side configuration.

## 2. What has been validated?

The repository has an offline suite with an explicit fixture-isolation gate, lint/typecheck/build commands, Prisma schema generation/validation, and unit/integration coverage across authorization, evidence, reconciliation, identity, agent, and UI contracts. Prisma Safety has dedicated tests for target detection, argument redaction, environment-file isolation, and fixture migration planning.

## 3. What is incomplete?

- Durable product-event observability remains unimplemented.
- Legacy mock/demo surfaces coexist with database-backed paths.
- External integrations and current production migration/deployment state are outside the offline gate.
- Agent and AI-assisted paths are newer/experimental and must retain read/approval boundaries.
- A first-class disposable-local migration target is not implemented in Prisma Safety.

## 4. Highest-priority next steps

1. Keep the handoff gate green and make the canonical docs part of every durable state change.
2. Consolidate the Agent/document-search experience with strong organization authorization and clear read-only capability labels.
3. Inventory mock versus persisted surfaces and simplify the product experience deliberately.
4. Establish an approved read-only environment inventory before release or migration planning.
5. Implement durable product observability only after reviewing `PRODUCT_OBSERVABILITY_CONTRACT.md`.

## 5. Important technical debt

Phase-named scripts encode valuable experiments but vary in assumptions and side effects. Historical release notes are not live environment truth. The migration classifier embeds the allowlisted hosted targets and must be deliberately updated if infrastructure changes. Generated Prisma code is intentionally untracked and rebuilt on install.

## 6. Infrastructure

The code is designed for Vercel plus Neon/Postgres and optional Resend, WhatsApp Cloud API, and OpenAI services. Exact resource configuration and credentials live outside Git. This handoff did not inspect or mutate them.

## 7. Do not touch casually

Production/fixtures databases, Prisma migrations, platform configuration, authentication secrets, outbound communications, customer data, and any script that loads `.env.local` or `.env.fixtures.local`.

## 8. Architectural decisions

Start with `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, the Prisma schema/migrations, and executable tests. `PRODUCT_OBSERVABILITY_CONTRACT.md` is a current scoped contract. `RELEASE_CHECKPOINT_4_3A.md` is historical.

## 9. How to continue

Follow `AGENTS.md`, work from a clean branch, preserve invariants, add tests with code, and run the full offline handoff gate. Treat external access and side effects as separate approval-gated work.

## 10. Intentionally absent from GitHub

Credentials, local/fixture/production env files, Vercel linkage, customer/consortium exports, real statements and evidence, logs/screenshots/reports, local databases, and external preservation artifacts. The separate ConcilIA showroom/demo is also not part of this repository and should become its own `concilia-demo` repository.
