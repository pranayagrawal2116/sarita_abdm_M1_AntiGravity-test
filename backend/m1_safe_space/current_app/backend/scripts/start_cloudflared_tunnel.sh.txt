#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
STATE_DIR="$ROOT_DIR/.cloudflared"
LOG_FILE="$STATE_DIR/tunnel.log"
PID_FILE="$STATE_DIR/tunnel.pid"
URL_FILE="$STATE_DIR/public_url"
PORT_VALUE="${1:-${PORT:-3000}}"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-$(command -v cloudflared || true)}"

if [[ -z "$CLOUDFLARED_BIN" ]]; then
  echo "cloudflared is not installed. Install it first."
  exit 1
fi

mkdir -p "$STATE_DIR"

if [[ -f "$PID_FILE" ]]; then
  EXISTING_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${EXISTING_PID}" ]] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    kill "$EXISTING_PID" 2>/dev/null || true
    sleep 1
  fi
fi

: > "$LOG_FILE"

nohup "$CLOUDFLARED_BIN" tunnel --url "http://127.0.0.1:${PORT_VALUE}" --no-autoupdate >"$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"

PUBLIC_URL=""
for _ in {1..60}; do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "cloudflared exited unexpectedly."
    cat "$LOG_FILE"
    exit 1
  fi

  PUBLIC_URL="$(grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' "$LOG_FILE" | tail -n 1 || true)"
  if [[ -n "$PUBLIC_URL" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$PUBLIC_URL" ]]; then
  echo "Timed out while waiting for cloudflared to publish a public URL."
  cat "$LOG_FILE"
  exit 1
fi

echo "$PUBLIC_URL" > "$URL_FILE"

if [[ -f "$ENV_FILE" ]]; then
  if grep -q '^PUBLIC_BASE_URL=' "$ENV_FILE"; then
    sed -i.bak "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=$PUBLIC_URL|" "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
  else
    printf '\nPUBLIC_BASE_URL=%s\n' "$PUBLIC_URL" >> "$ENV_FILE"
  fi
else
  printf 'PUBLIC_BASE_URL=%s\n' "$PUBLIC_URL" > "$ENV_FILE"
fi

echo "Cloudflare tunnel started."
echo "Public URL: $PUBLIC_URL"
echo "Updated: $ENV_FILE"
echo "PID: $PID"
echo "Log: $LOG_FILE"
