#!/bin/sh
# Gives n8n a public HTTPS address so Telegram buttons work from any phone network.
# Starts a free Cloudflare quick tunnel (no account), reads its URL, and restarts n8n with WEBHOOK_URL set to it.
# The URL changes every time the tunnel starts.
cd "$(dirname "$0")/.." || exit 1

echo "Starting the Cloudflare tunnel..."
docker compose --profile tunnel up -d tunnel || exit 1

URL=""
for i in $(seq 1 30); do
  URL=$(docker compose --profile tunnel logs tunnel 2>/dev/null | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)
  [ -n "$URL" ] && break
  sleep 2
done

if [ -z "$URL" ]; then
  echo "Could not read the tunnel address. Check: docker compose --profile tunnel logs tunnel"
  exit 1
fi

echo "Tunnel address: $URL"
# Restart n8n with the public address so Telegram buttons point to the tunnel
N8N_WEBHOOK_URL="$URL/" docker compose up -d n8n
echo "n8n restarted with WEBHOOK_URL=$URL/"
echo "The n8n editor is now reachable at $URL too (protected by the owner password). Stop with: docker compose --profile tunnel stop tunnel"
