#!/bin/sh
set -eu
umask 077
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-sales-coach}"
ops_env="${OPS_ENV_FILE:-.env.ops}"
if [ -f "$ops_env" ]; then
  test "$(stat -c '%a' "$ops_env")" = 600
  case "$ops_env" in /*) ;; *) ops_env="./$ops_env";; esac
  set -a
  . "$ops_env"
  set +a
fi
logs="$(mktemp)"
trap 'rm -f "$logs"' EXIT
docker compose --env-file .env.production logs --no-color --no-log-prefix --since 1h app caddy > "$logs" 2>&1
docker compose --env-file .env.production exec -T -e OPS_ALERT_URL -e OPS_OFFSITE_REQUIRED app node scripts/ops-monitor.mjs < "$logs"
