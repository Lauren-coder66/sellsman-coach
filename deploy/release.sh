#!/bin/sh
set -eu
release="${1:?Usage: sh deploy/release.sh build|rollback release-tag}"
tag="${2:?Provide the release image tag}"
case "$tag" in *[!A-Za-z0-9_.-]*|'') exit 2;; esac
export APP_RELEASE="$tag"
case "$release" in
  build)
    docker compose --env-file .env.production config --quiet
    docker compose --env-file .env.production build app
    ;;
  rollback)
    docker image inspect "sales-coach:$tag" >/dev/null
    ;;
  *) exit 2;;
esac
docker compose --env-file .env.production up -d --no-build --wait
