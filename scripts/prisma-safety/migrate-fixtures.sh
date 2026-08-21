#!/usr/bin/env bash
# Safety hardening — post-incidente Fase 5.9. ÚNICO camino recomendado para
# migrar dev-fixtures — nunca "npx prisma migrate dev" pelado (ver
# FASE_5_9_INCIDENT_AUDIT.md / FASE_5_9_SAFETY_HARDENING.md).
#
# El orquestador TS resuelve la URL UNA sola vez con la precedencia común,
# la valida y reutiliza exactamente ese valor para preflight y migrate.
#
# Uso: scripts/prisma-safety/migrate-fixtures.sh --name mi_migracion
set -euo pipefail
cd "$(dirname "$0")/../.."
exec npx tsx scripts/prisma-safety/migrate-fixtures.mts "$@"
