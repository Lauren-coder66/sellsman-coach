#!/bin/sh
set -eu
root="$(pwd)"
tmp="$(mktemp -d)"
project="sales-ci-$(date +%s)"
compose() { docker compose --project-name "$project" --env-file "$tmp/.env.production" -f "$tmp/compose.yaml" -f "$tmp/staging.yaml" "$@"; }
cleanup() {
  code="$?"
  if [ "$code" -ne 0 ]; then compose ps -a || true; fi
  compose down -v >/dev/null 2>&1 || true
  exit "$code"
}
trap cleanup EXIT
cp "$root/compose.yaml" "$tmp/compose.yaml"
mkdir "$tmp/deploy"
sed 's/^{$PUBLIC_DOMAIN} {/localhost {/; /^localhost {/a\	tls internal' "$root/deploy/Caddyfile" |
  sed 's/{\$PUBLIC_DOMAIN}/localhost/g; s|https://localhost{uri}|https://localhost:3443{uri}|; 1a\	http_port 3180\n	https_port 3443' > "$tmp/deploy/Caddyfile"
printf 'PUBLIC_DOMAIN=localhost\nAPP_RELEASE=ci\nAI_MODE=mock\nACCOUNT_REQUIRED=0\n' > "$tmp/.env.production"
cat > "$tmp/staging.yaml" <<'EOF'
services:
  app:
    environment:
      RELEASE_PROFILE: staging
  caddy:
    ports: !override ["127.0.0.1:3180:3180", "127.0.0.1:3443:3443"]
EOF
docker run --rm -e PUBLIC_DOMAIN=localhost -v "$tmp/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2.11.9-alpine caddy validate --config /etc/caddy/Caddyfile
compose up -d --no-build --wait
for i in 1 2 3 4 5 6 7 8 9 10; do
  if compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$tmp/ca.crt" 2>/dev/null; then break; fi
  sleep 1
done
base=https://localhost:3443
test "$(curl -fsS -w '%{http_code}' -D "$tmp/redirect" -o /dev/null http://localhost:3180/api/health)" = 308
grep -qi 'location: https://localhost:3443/api/health' "$tmp/redirect"
https() { curl -fsS --cacert "$tmp/ca.crt" "$@"; }
https "$base/api/health" | grep -q '"ok"'
test "$(compose exec -T app id -u | tr -d '\r')" != 0
compose exec -T app sh -c 'test -w /var/lib/sales-coach && ! test -w /app && test -w /app/.next/cache'
compose exec -T app node --input-type=module -e "import DB from 'better-sqlite3'; import { readMigrationFiles } from 'drizzle-orm/migrator'; const d = new DB(process.env.DATABASE_URL, {readonly:true}); if (d.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get().n !== readMigrationFiles({migrationsFolder:'drizzle'}).length) process.exit(1);"
echo 'PASS: HTTPS redirect, health, non-root, read-only filesystem, migrations'
scene='{"product":"容器恢复验收","description":"测试","identity":"门店负责人","difficulty":"简单","personality":"普通型","goal":"了解客户需求"}'
id="$(https -c "$tmp/cookies" -H 'Content-Type: application/json' -d "$scene" "$base/api/sessions" | jq -er '.data.id')"
compose exec -T app node scripts/sqlite-copy.mjs backup /var/lib/sales-coach/sales-coach.sqlite /var/backups/sales-coach/qa.sqlite
compose restart app
compose up -d --no-build --wait app
https -b "$tmp/cookies" "$base/api/sessions/$id" | jq -e --arg id "$id" '.data.session.id == $id' >/dev/null
compose up -d --no-build --force-recreate --wait app
https -b "$tmp/cookies" "$base/api/sessions/$id" | jq -e --arg id "$id" '.data.session.id == $id' >/dev/null
echo 'PASS: data survives restart and container recreation'
compose exec -T app node scripts/sqlite-copy.mjs restore /var/backups/sales-coach/qa.sqlite /var/lib/sales-coach/restored.sqlite
compose exec -T app node -e "const d= new (require('better-sqlite3'))('/var/lib/sales-coach/restored.sqlite',{readonly:true});if(!d.prepare('SELECT id FROM training_sessions WHERE id=?').get(process.argv[1])) process.exit(1)" "$id"
echo 'PASS: online backup and restored row'
compose logs --no-color --no-log-prefix app caddy | compose exec -T app node scripts/ops-monitor.mjs
echo 'PASS: operational metrics collection'
