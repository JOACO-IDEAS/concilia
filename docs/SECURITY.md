# Security and operational boundaries

## Data classes

- **Tracked:** source, schema/migrations, synthetic test fixtures, safe placeholders, and sanitized documentation.
- **Ignored local:** `.env`, `.env.local`, `.env.fixtures.local`, `.vercel/`, build output, logs, reports, screenshots, local databases, and agent runtime state.
- **External only:** production/fixture credentials, provider tokens, customer data/exports, real statements/evidence, and platform configuration values.

Never print secrets in logs, test output, screenshots, commits, issues, or handoff documents. `NEXT_PUBLIC_APP_URL` is browser-visible and must never carry a credential. Every other credential remains server-only.

## Environment boundaries

| Environment | Purpose | Default access |
|---|---|---|
| Local | Code understanding and disposable development | Safe with localhost-only configuration |
| Fixtures | Synthetic database-backed verification | Explicit opt-in; ignored credentials; mutating |
| Production | Hosted product/customer environment | No access without exact human authorization |

Vercel and Neon configuration may exist outside Git, but local files are not an authoritative inventory. Do not infer current deployment or migration state from them.

## Prisma Safety

- `generate`, `validate`, and `format` do not connect or mutate and may run normally.
- `migrate`, `db`, and `studio` are classified as risky by `prisma.config.ts`.
- Risky commands require an explicit `PRISMA_TARGET_ENV` and a recognized matching endpoint; otherwise they abort.
- `npx tsx scripts/prisma-safety/preflight.mts --target=fixtures|production` performs read-only target and migration inspection, but it still connects externally and requires authorization.
- `scripts/prisma-safety/migrate-fixtures.mts` is fixtures-only. There is intentionally no casual production migration wrapper.

Never run `migrate dev`, `migrate deploy`, `db push`, `db seed`, `db execute`, `studio`, or a phase script until its effective datasource and side effects are understood. Production needs a reviewed migration plan, backup/recovery posture, read-only preflight, explicit approval, and a controlled window.

## External effects

Email, WhatsApp, payment webhooks, external model calls, deployment, and real-data access are separately gated. Missing provider configuration is not permission to substitute a real key. Tests must mock network behavior unless an external test is explicitly approved.

## Reporting vulnerabilities

Share the affected surface and remediation privately with the repository owner. Do not include credentials, customer records, statement contents, or reusable authentication material in the report.
