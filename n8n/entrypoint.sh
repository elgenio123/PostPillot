#!/bin/sh
# Prepares n8n for PostPilot, then starts it:
# imports + activates the workflows when the JSON files changed, creates the Telegram credential
# from .env, and creates the owner account on first launch.
set -u
WF_DIR=/bootstrap/workflows
STATE=/home/node/.n8n/.postpilot
WORKFLOW_IDS="ppGenerateDrafts ppRedraftPost001 ppTelegramApprov ppPublishPost001 ppWeeklyReport01"
mkdir -p "$STATE"

say() { echo "[postpilot] $*"; }

# Which database n8n uses: a new database means the workflows must be imported again
db_id="${DB_TYPE:-sqlite}:${DB_POSTGRESDB_HOST:-}:${DB_POSTGRESDB_DATABASE:-}"

# Re-import only when the workflow files (or the database) changed, so edits made in the editor survive restarts
wf_hash=$( (cat "$WF_DIR"/*.json; echo "$db_id") | md5sum | cut -d' ' -f1)
if [ "${N8N_FORCE_REIMPORT:-false}" = "true" ] || [ "$(cat "$STATE/workflows.md5" 2>/dev/null)" != "$wf_hash" ]; then
  say "Importing workflows from $WF_DIR"
  if n8n import:workflow --separate --input="$WF_DIR"; then
    for id in $WORKFLOW_IDS; do
      # Newer n8n versions "publish" workflows; older ones "activate" them
      n8n publish:workflow --id="$id" >/dev/null 2>&1 \
        || n8n update:workflow --id="$id" --active=true \
        || say "Could not activate $id, open it in the editor and switch it on"
    done
    echo "$wf_hash" > "$STATE/workflows.md5"
  else
    say "Workflow import failed, see the error above"
  fi
fi

# Telegram credential from .env (only when the token changed)
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
  tg_hash=$(printf '%s%s' "$TELEGRAM_BOT_TOKEN" "$db_id" | md5sum | cut -d' ' -f1)
  if [ "$(cat "$STATE/telegram.md5" 2>/dev/null)" != "$tg_hash" ]; then
    say "Creating the Telegram credential"
    printf '[{"id":"ppTelegramCred01","name":"PostPilot Telegram bot","type":"telegramApi","data":{"accessToken":"%s"}}]' \
      "$TELEGRAM_BOT_TOKEN" > /tmp/telegram-credential.json
    n8n import:credentials --input=/tmp/telegram-credential.json && echo "$tg_hash" > "$STATE/telegram.md5"
    rm -f /tmp/telegram-credential.json
  fi
fi

node /bootstrap/setup-owner.mjs &
exec n8n start
