#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="$ROOT_DIR/.cloudflared"
PID_FILE="$STATE_DIR/tunnel.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No cloudflared tunnel PID file found."
  exit 0
fi

PID="$(cat "$PID_FILE" 2>/dev/null || true)"
if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
  kill "$PID" 2>/dev/null || true
  echo "Stopped cloudflared tunnel process $PID."
else
  echo "cloudflared tunnel was not running."
fi

rm -f "$PID_FILE" "$STATE_DIR/public_url"
