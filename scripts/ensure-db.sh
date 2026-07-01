#!/usr/bin/env bash
# Ensure the dev Postgres is up before the API boots. The container tends to exit when the machine
# idles, which surfaces downstream as login/API 500s (ECONNREFUSED :8602). Idempotent + non-blocking:
# if it can't confirm readiness it still lets the API start (the DB client connects lazily anyway).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 0

docker compose up -d >/dev/null 2>&1 || true
for _ in $(seq 1 30); do
    if docker exec galleo-pg pg_isready -q >/dev/null 2>&1; then
        echo "✓ postgres ready"
        exit 0
    fi
    sleep 0.5
done
echo "⚠ postgres not confirmed ready after 15s — starting API anyway" >&2
exit 0
