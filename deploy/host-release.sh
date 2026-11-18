#!/bin/sh
# Install a reviewed copy as the forced command for the deployment SSH key.
set -euf
set -- ${SSH_ORIGINAL_COMMAND:-}
test "$#" -eq 2
test "$1" = release
sha="$2"
test "${#sha}" -eq 40
case "$sha" in *[!0-9a-f]*) exit 2;; esac
base="${SALES_RELEASE_ROOT:-/srv/sales-coach}"
repo="$base/repo"
release="$base/releases/$sha"
envfile="$base/shared/.env.production"
test -f "$envfile"
test "$(stat -c %a "$envfile")" = 600
exec 9>"$base/shared/release.lock"
flock -n 9
git -C "$repo" fetch origin refs/heads/main:refs/remotes/origin/main
git -C "$repo" merge-base --is-ancestor "$sha" origin/main
test "$(git -C "$repo" cat-file -t "$sha")" = commit
if [ ! -d "$release" ]; then git -C "$repo" worktree add --detach "$release" "$sha"; fi
test "$(git -C "$release" rev-parse HEAD)" = "$sha"
test -z "$(git -C "$release" status --porcelain)"
cd "$release"
if [ ! -e .env.production ]; then ln -s "$envfile" .env.production; fi
test "$(readlink -f .env.production)" = "$(readlink -f "$envfile")"
exec sh deploy/release.sh build "$sha"
