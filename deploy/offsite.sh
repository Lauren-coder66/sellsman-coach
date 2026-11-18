#!/bin/sh
set -eu
umask 077
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-sales-coach}"
ops_env="${OPS_ENV_FILE:-.env.ops}"
test -f "$ops_env"
test "$(stat -c '%a' "$ops_env")" = 600
case "$ops_env" in /*) ;; *) ops_env="./$ops_env";; esac
set -a
. "$ops_env"
set +a
exec 9>"${ops_env}.lock"
flock -n 9

exec docker compose --env-file .env.production exec -T \
  -e BACKUP_PROVIDER -e BACKUP_BUCKET -e BACKUP_PREFIX -e BACKUP_KEEP_DAYS -e BACKUP_REGION -e BACKUP_ENDPOINT \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN -e OPS_ALERT_URL \
  app node scripts/offsite.mjs "$@"
