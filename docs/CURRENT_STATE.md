# Current state

Last reviewed during the G2 GitHub-ready technical handoff.

## Durable truth

- The core application, Prisma schema, 25 ordered migrations, and extensive offline suite are tracked here.
- Current domain code covers payments, bank/document ingestion, reconciliation candidates and scoring, human review, evidence history, payer identity, organization authorization, pilot access, and a read-oriented operational Agent.
- The default test gate is offline and statically verifies that the two `.fixtures.test.mts` suites are excluded.
- Prisma Safety guards `migrate`, `db`, and `studio` commands by comparing the effective datasource host with an explicit target. Unknown and mismatched targets abort.
- Hosted configuration is represented conceptually by Vercel and Neon integration conventions. This handoff did not connect to or verify current production state.
- Real email, WhatsApp, AI-provider, webhook, fixture-database, and production-database behavior requires separately managed credentials and explicit authorization.

## Current development focus

Recent work established ConcilIA Agent conversations, read-only operational tools, model-provider diagnostics, and administrative-document search. The next technical owner should consolidate this path without weakening organization authorization or turning agent suggestions into unreviewed writes.

## Known limitations and debt

- The root previously relied on external/historical progress context; the tracked `docs/` set is now canonical.
- Legacy mock/demo surfaces coexist with database-backed modules and should be labeled or retired deliberately.
- Product observability uses an in-memory development adapter and no durable production event store.
- Fixture and production migration state must be read from the target with the read-only preflight; historical reports are not current evidence.
- Some phase/operator scripts are valuable historical verification tools but are not safe default commands.
- External integrations are optional and not part of the offline validation gate.

## Historical documents

- `RELEASE_CHECKPOINT_4_3A.md` is a useful point-in-time checkpoint, not current production truth.
- `PRODUCT_OBSERVABILITY_CONTRACT.md` remains the scoped observability contract; its durable store is still planned.
- Phase-named scripts preserve development history and must be assessed before use rather than deleted wholesale.
