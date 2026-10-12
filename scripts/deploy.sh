#!/usr/bin/env bash
# Deploys PostPilot from this PC to the server, in stages:
#   setup → test → bootstrap (only on a fresh server) → deploy (server builds the images) → smoke test
# Usage: ./scripts/deploy.sh [--skip-tests] [--full-smoke]
#   --skip-tests   skip the local type check and API tests
#   --full-smoke   also run the whole agent story after deploying (a few cents of OpenRouter credit)
# Settings: deploy/deploy.conf (copy deploy/deploy.conf.example). Server .env: deploy/prod.env.
set -euo pipefail
cd "$(dirname "$0")/.."

SKIP_TESTS=false
FULL_SMOKE=false
for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=true ;;
    --full-smoke) FULL_SMOKE=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

stage() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok() { printf '\033[32m✓ %s\033[0m\n' "$*"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*"; exit 1; }

stage "1/5 Setup"
[ -f deploy/deploy.conf ] || fail "deploy/deploy.conf is missing. Copy deploy/deploy.conf.example and fill it in."
# shellcheck disable=SC1091
. deploy/deploy.conf
SSH_KEY="${SSH_KEY/#\~/$HOME}"
PROD_ENV_FILE="${PROD_ENV_FILE:-deploy/prod.env}"
[ -n "${SSH_HOST:-}" ] && [ -n "${SSH_USER:-}" ] || fail "Set SSH_HOST and SSH_USER in deploy/deploy.conf"
[ -f "$SSH_KEY" ] || fail "SSH key not found: $SSH_KEY"
[ -f "$PROD_ENV_FILE" ] || fail "$PROD_ENV_FILE is missing. Copy deploy/prod.env.example and fill it in."
prod_value() { grep "^$1=" "$PROD_ENV_FILE" | tail -1 | cut -d= -f2- || true; }
for key in POSTPILOT_SECRET POSTGRES_PASSWORD OPENROUTER_API_KEY ADMIN_EMAIL ADMIN_PASSWORD; do
  [ -n "$(prod_value "$key")" ] || fail "$key is empty in $PROD_ENV_FILE"
done
DOMAIN="$(prod_value APP_DOMAIN)"
if [ -n "$DOMAIN" ]; then APP_URL="https://$DOMAIN"; N8N_URL="https://$DOMAIN:5678/"; else APP_URL="http://$SSH_HOST"; N8N_URL="http://$SSH_HOST:5678/"; fi
SSH=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$SSH_USER@$SSH_HOST")
"${SSH[@]}" true || fail "Cannot SSH to $SSH_USER@$SSH_HOST (check the IP, key and security group port 22)"
node_check=$(docker run --rm -v "$PWD":/repo -w /repo node:alpine sh -c 'node scripts/build-workflows.mjs >/dev/null && echo ok')
[ "$node_check" = ok ] || fail "Could not regenerate the n8n workflows"
git diff --quiet -- n8n/workflows || fail "n8n/workflows changed after regenerating: review and commit them first"
ok "Config OK, server reachable, target $APP_URL"

stage "2/5 Test"
if [ "$SKIP_TESTS" = true ]; then
  echo "Skipped (--skip-tests)"
else
  ./scripts/test.sh || fail "Tests failed: nothing was deployed"
  ok "Type check and API tests passed"
fi

stage "3/5 Bootstrap (only if needed)"
if "${SSH[@]}" "test -f /opt/postpilot/.bootstrapped && command -v docker >/dev/null"; then
  echo "Server already prepared, nothing to do"
else
  "${SSH[@]}" "cat > /tmp/postpilot-bootstrap.sh" < deploy/bootstrap.sh
  "${SSH[@]}" "sudo sh /tmp/postpilot-bootstrap.sh $SSH_USER && rm /tmp/postpilot-bootstrap.sh"
  ok "Server prepared (Docker, swap, firewall, /opt/postpilot)"
fi

stage "4/5 Deploy"
# Only files tracked or new-but-not-ignored by git: no .env, no node_modules
echo "Uploading the source ($(git ls-files --cached --others --exclude-standard | wc -l) files)..."
git ls-files -z --cached --others --exclude-standard | tar --null -czf - -T - \
  | "${SSH[@]}" "rm -rf /opt/postpilot/src.new && mkdir -p /opt/postpilot/src.new && tar -xzf - -C /opt/postpilot/src.new && rm -rf /opt/postpilot/src && mv /opt/postpilot/src.new /opt/postpilot/src"
"${SSH[@]}" "mkdir -p /opt/postpilot/postgres && cd /opt/postpilot/src && cp deploy/docker-compose.prod.yml ../docker-compose.yml && cp deploy/docker-compose.build.yml ../docker-compose.build.yml && cp deploy/Caddyfile ../Caddyfile && cp deploy/postgres/init-n8n-db.sh ../postgres/"
{
  cat "$PROD_ENV_FILE"
  echo
  echo "WEB_IMAGE=postpilot-web:local"
  echo "N8N_IMAGE=postpilot-n8n:local"
  grep -q '^N8N_WEBHOOK_URL=' "$PROD_ENV_FILE" || echo "N8N_WEBHOOK_URL=$N8N_URL"
} | "${SSH[@]}" "umask 077 && cat > /opt/postpilot/.env"
echo "Building the images on the server (first time: 5-15 minutes)..."
"${SSH[@]}" "cd /opt/postpilot && docker compose -f docker-compose.yml -f docker-compose.build.yml build && docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --remove-orphans && docker image prune -f >/dev/null && docker compose ps"
ok "Deployed"

stage "5/5 Smoke test"
# n8n imports and publishes the workflows before it starts: a few minutes on a small server
echo "Waiting for n8n to finish starting (first start can take 3-5 minutes)..."
for i in $(seq 1 90); do
  if "${SSH[@]}" "cd /opt/postpilot && docker compose exec -T web wget -qO- -T 5 http://n8n:5678/healthz" >/dev/null 2>&1; then break; fi
  [ "$i" = 90 ] && fail "n8n did not start. Logs: ssh to the server, cd /opt/postpilot && docker compose logs n8n"
  sleep 5
done
ok "n8n is up"
echo "Waiting for $APP_URL/api/health ..."
for i in $(seq 1 60); do
  if curl -fsS -m 10 "$APP_URL/api/health" 2>/dev/null | grep -q '"ok":true'; then break; fi
  [ "$i" = 60 ] && fail "The app did not become healthy. Logs: ssh to the server, cd /opt/postpilot && docker compose logs web"
  sleep 5
done
docker run --rm --network host -e APP_URL="$APP_URL" -e SMOKE_FULL="$FULL_SMOKE" \
  -e SMOKE_EMAIL="${SMOKE_EMAIL:-$(prod_value ADMIN_EMAIL)}" -e SMOKE_PASSWORD="${SMOKE_PASSWORD:-$(prod_value ADMIN_PASSWORD)}" \
  -v "$PWD/web/scripts":/s:ro node:alpine node /s/smoke-test.mjs || fail "Smoke test failed"

printf '\n\033[1;32mPostPilot is live: %s  (n8n: %s)\033[0m\n' "$APP_URL" "$N8N_URL"
