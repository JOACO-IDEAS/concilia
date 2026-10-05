# ConcilIA agent instructions

Read, in order, before changing code:

1. `docs/TECHNICAL_HANDOFF.md`
2. `docs/CURRENT_STATE.md`
3. `docs/PRODUCT.md`
4. `docs/ARCHITECTURE.md`
5. `docs/SECURITY.md`
6. `docs/SETUP.md`
7. `docs/ROADMAP.md`

## Non-negotiable boundaries

- This repository is the ConcilIA core product. The separate showroom/demo is not part of it.
- Never read, print, commit, or copy values from `.env`, `.env.local`, or `.env.fixtures.local`.
- Never connect to production or run a Prisma write command unless the human explicitly authorizes that exact operation.
- Treat `prisma migrate`, `prisma db`, `prisma studio`, fixture scripts, email, WhatsApp, webhooks, and external AI calls as side-effecting.
- Preserve tenant authorization: session → administrator → organization → resource.
- Preserve append-only evidence, reconciliation, decision, and audit history. Do not turn a suggestion into an automatic action without explicit product approval.
- Do not expose server secrets through `NEXT_PUBLIC_*` variables.

## Working expectations

- Check `git status` before and after work; preserve unrelated user changes.
- Use `npm test` for the offline suite. Fixture tests require explicit authorization and are intentionally excluded.
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run db:generate`, `npm run db:validate`, and `npm run build` for a normal handoff.
- For a risky database command, use the Prisma Safety preflight and an explicit `PRISMA_TARGET_ENV`; production still requires separate human approval.
- Update `docs/CURRENT_STATE.md` and `docs/TECHNICAL_HANDOFF.md` when the durable product state changes.

<!-- BEGIN:nextjs-agent-rules -->
## Next.js version rule

This repository uses a recent Next.js version with breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing framework-sensitive code and heed deprecation notices.
<!-- END:nextjs-agent-rules -->
