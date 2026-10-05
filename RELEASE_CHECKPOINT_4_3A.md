# ConcilIA — Checkpoint integral 4.3A

> Historical snapshot. This file preserves the state observed at checkpoint 4.3A; it is not authoritative for current production, migration, or release status. Start with `docs/CURRENT_STATE.md` and `docs/TECHNICAL_HANDOFF.md`.

## Alcance

Este checkpoint consolida el estado funcional acumulado de producto SaaS,
autorización multi-tenant, Pilot Auth, rate limiting durable, Resend,
Operational Brain, calibración cerrada, matching/evidence/shadow, Agent OS,
Prisma Safety y sus pruebas operativas.

## Contratos preservados

- Sesión → administrador → organización → recurso para todo acceso operativo.
- Magic links almacenan únicamente `tokenHash`; el token nace revocado y sólo
  se habilita tras la aceptación del proveedor de email.
- Rate limiting durable guarda HMACs con dominios separados, nunca email, IP o
  token en claro; opera append-only y falla cerrado.
- La calibración preserva `ORGANIC=0`; AUTO no tiene camino ejecutable.
- Matching, evidence, shadow y recomendaciones continúan siendo observación o
  propuesta: no crean conciliaciones automáticas.

## Migraciones incluidas

Las migraciones locales 12–16 forman un orden cronológico único. Fixtures se
encuentra en 16/16; Production queda intencionalmente en 11/16 y requiere una
ventana de migración controlada antes de cualquier deploy:

1. `20260810142647_add_shadow_match_top_candidates`
2. `20260811011522_add_payment_evidence_assessment_log`
3. `20260811135548_payment_evidence_append_only_history`
4. `20260812190000_add_pilot_access_tokens`
5. `20260813090000_add_pilot_access_rate_limit_events`

## Verificación del checkpoint

- Calibración: 145 tests PASS.
- Matching/evidence/shadow: 246 tests PASS.
- Pilot Auth/email/rate limiting: 21 tests PASS.
- Rate limiting real sobre fixtures, serializado: PASS tras una repetición
  aislada; todos los artefactos sintéticos fueron limpiados.
- Suite serializada: 74 archivos, 727 tests PASS.
- TypeScript, lint, `git diff --check`, Prisma validate/generate y build de
  producción local: PASS.
- Los 23 archivos puros de calibración se verificaron contra el respaldo
  externo (`SHA256SUMS.txt`): 23/23 hashes PASS.

## Exclusiones explícitas

No se incluyen `.env*`, `.vercel`, `.next`, `node_modules`, cliente Prisma
generado, preservaciones externas, archivos de sistema, logs ni cachés de
agentes. En particular queda fuera
`src/lib/calibration/.omc/state/sessions/*/pre-tool-advisory-throttle.json`.
La regla actual de Git no ignora ese caché anidado; se excluye mediante la
allowlist explícita de staging y queda clasificado como tooling local.

## Resend y release posterior

Las variables de Resend están configuradas en Vercel Production, pero no se
realizó deploy ni envío de email. Antes de una prueba controlada se requiere:

1. migrar Production mediante Prisma Safety;
2. desplegar este commit exacto;
3. autorizar separadamente un único email de prueba permitido por Resend.
