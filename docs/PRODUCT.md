# Product

## Thesis

ConcilIA is an operational layer for administrators of properties and consortia. It complements rather than replaces an ERP. Its job is to understand fragmented financial and operational evidence, propose explainable resolutions, complete supported work, and isolate genuine exceptions for people.

The core flow is:

```text
source data → ingestion → evidence → candidate generation → explainable scoring
            → reconciliation → human exception handling → operational history
```

## Current product surfaces

- Operational inbox and dashboard views.
- Organizations, units, obligations, delinquency, activity, and reporting views.
- Payment and statement ingestion, reconciliation, shadow matching, and human review.
- Payment-evidence intake, extraction, correlation, and unknown-payer resolution.
- Payer identity, identity signals, payer/unit associations, and evidence history.
- Pilot access and organization-scoped authorization.
- A read-oriented operational Agent with optional model-backed orchestration.

Some legacy/mock UI remains alongside database-backed flows. A visible screen is not proof that its persistence, automation, or external integration is production-ready; consult `CURRENT_STATE.md` and tests.

## Product invariants

- Bank-confirmed money, documentary evidence, and human assertions are different facts.
- Suggestions do not become reconciliations merely because their score is high.
- Ambiguity belongs in human review, with reasons and evidence preserved.
- Organization scope is resolved server-side and enforced for every resource.
- Evidence, decisions, and learning history favor append-only records over destructive rewriting.
- Automation must reduce human work without obscuring provenance or auditability.

## Not this repository

The separate ConcilIA showroom/demo is not part of this core repository and must not be merged into it implicitly.
