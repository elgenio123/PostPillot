#!/bin/sh
# Smoke test against the running stack (docker compose up -d). Signs in with ADMIN_EMAIL / ADMIN_PASSWORD from .env.
#   ./scripts/smoke.sh                   quick checks: health, login protection, sign-in, n8n workflows
#   SMOKE_FULL=true ./scripts/smoke.sh   also the whole agent story (real OpenRouter calls, Mock publishing)
cd "$(dirname "$0")/.." || exit 1
env_value() { grep "^$1=" .env | head -1 | cut -d= -f2-; }
docker run --rm --network host -e APP_URL -e SMOKE_FULL -e SMOKE_MODEL \
  -e SMOKE_EMAIL="${SMOKE_EMAIL:-$(env_value ADMIN_EMAIL)}" -e SMOKE_PASSWORD="${SMOKE_PASSWORD:-$(env_value ADMIN_PASSWORD)}" \
  -v "$PWD/web/scripts":/s:ro node:alpine node /s/smoke-test.mjs
