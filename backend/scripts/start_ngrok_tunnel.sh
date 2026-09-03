#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
STATE_DIR="$ROOT_DIR/.ngrok"
LOG_FILE="$STATE_DIR/tunnel.log"
PID_FILE="$STATE_DIR/tunnel.pid"
URL_FILE="$STATE_DIR/public_url"
PORT_VALUE="${1:-${PORT:-3000}}"
NGROK_BIN="${NGROK_BIN:-$(command -v ngrok || true)}"

if [[ -z "$NGROK_BIN" ]]; then
  echo "ngrok is not installed. Please install it using:"
  echo "brew install ngrok/ngrok/ngrok"
  exit 1
fi

# Load .env to get NGROK_DOMAIN safely without evaluating it
if [[ -f "$ENV_FILE" ]]; then
  NGROK_DOMAIN=$(grep "^NGROK_DOMAIN=" "$ENV_FILE" | head -n 1 | cut -d "=" -f2- | tr -d '"' | tr -d "'")
fi

if [[ -z "${NGROK_DOMAIN:-}" ]]; then
  echo "ERROR: NGROK_DOMAIN is not set in your .env file."
  echo ""
  echo "To get your free static domain:"
  echo "1. Log into https://dashboard.ngrok.com"
  echo "2. Go to Cloud Edge -> Domains"
  echo "3. Copy your free domain (e.g. funny-words.ngrok-free.app)"
  echo ""
  echo "Then add it to backend/.env like this:"
  echo "NGROK_DOMAIN=your-domain.ngrok-free.app"
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

echo "Starting ngrok on port ${PORT_VALUE} with domain ${NGROK_DOMAIN}..."
nohup "$NGROK_BIN" http --url="https://${NGROK_DOMAIN}" "${PORT_VALUE}" >"$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"

PUBLIC_URL="https://${NGROK_DOMAIN}"
echo "$PUBLIC_URL" > "$URL_FILE"

# Wait a second to ensure it doesn't crash immediately (e.g. invalid auth token or domain)
sleep 2
if ! kill -0 "$PID" 2>/dev/null; then
  echo "ngrok exited unexpectedly! Check the logs below. (Did you run 'ngrok config add-authtoken <TOKEN>'?)"
  cat "$LOG_FILE"
  exit 1
fi

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

echo "================================================="
echo "Ngrok static tunnel started successfully!"
echo "Public URL: $PUBLIC_URL"
echo "PID: $PID"
echo "Log: $LOG_FILE"
echo "================================================="
echo "You never have to update the ABDM portal again!"
