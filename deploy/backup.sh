#!/bin/sh
set -eu
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-sales-coach}"
stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
docker compose --env-file .env.production exec -T app sh -c 'node scripts/sqlite-copy.mjs backup "$DATABASE_URL" "$1"' sh "/var/backups/sales-coach/${stamp}.sqlite"
