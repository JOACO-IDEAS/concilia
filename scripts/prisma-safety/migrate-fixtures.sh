#!/usr/bin/env bash
# Safety hardening — post-incidente Fase 5.9. ÚNICO camino recomendado para
# migrar dev-fixtures — nunca "npx prisma migrate dev" pelado (ver
# FASE_5_9_INCIDENT_AUDIT.md / FASE_5_9_SAFETY_HARDENING.md).
#
# Dos capas independientes de protección, ninguna confía en la otra:
#   1) preflight.mts (solo lectura) — confirma host/database/schema/entorno
#      ANTES de tocar nada, aborta si algo no coincide.
#   2) --url explícito (nunca variables de entorno) + PRISMA_TARGET_ENV=fixtures
#      — la guardia automática de prisma.config.ts vuelve a verificar el
#      mismo valor antes de dejar correr el comando real.
#
# Uso: scripts/prisma-safety/migrate-fixtures.sh --name mi_migracion
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ ! -f .env.fixtures.local ]; then
  echo "[migrate-fixtures] No existe .env.fixtures.local — abortando." >&2
  exit 1
fi

FIXTURES_URL=$(grep '^DATABASE_URL=' .env.fixtures.local | head -1 | sed 's/^DATABASE_URL=//' | sed 's/^"//;s/"$//')
if [ -z "$FIXTURES_URL" ]; then
  echo "[migrate-fixtures] No se pudo leer DATABASE_URL de .env.fixtures.local — abortando." >&2
  exit 1
fi

echo "[migrate-fixtures] Paso 1/2 — preflight de solo lectura..."
npx tsx scripts/prisma-safety/preflight.mts --target=fixtures

echo ""
echo "[migrate-fixtures] Paso 2/2 — ejecutando prisma migrate dev con --url explícito + PRISMA_TARGET_ENV=fixtures..."
PRISMA_TARGET_ENV=fixtures npx prisma migrate dev --url "$FIXTURES_URL" "$@"
