#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_ENV="$ROOT_DIR/backend/.env"
API_CONFIG_DART="$ROOT_DIR/lib/utils/api_config.dart"

USAGE="Usage: ./scripts/switch_env.sh [local | ngrok | server]

Environments:
  local   - Flutter connects to http://localhost:3000/api (Fast local testing without ngrok warnings)
  ngrok   - Flutter & Node use https://isolation-pouncing-ecard.ngrok-free.dev (For remote testing & ABDM callbacks)
  server  - Flutter & Node use https://abdmapi.saritainfotech.com (Production IIS environment)
"

if [ $# -lt 1 ]; then
  echo "$USAGE"
  exit 1
fi

TARGET_ENV="$(echo "$1" | tr '[:upper:]' '[:lower:]')"

NGROK_URL="https://isolation-pouncing-ecard.ngrok-free.dev"
NGROK_DOMAIN="isolation-pouncing-ecard.ngrok-free.dev"
SERVER_URL="https://abdmapi.saritainfotech.com"
LOCAL_URL="http://localhost:3000"

case "$TARGET_ENV" in
  local)
    TARGET_API_URL="${LOCAL_URL}/api"
    TARGET_PUBLIC_BASE="${NGROK_URL}"
    DESCRIPTION="LOCAL DEVELOPMENT (Flutter direct to localhost:3000, Callbacks via ngrok)"
    ;;
  ngrok)
    TARGET_API_URL="${NGROK_URL}/api"
    TARGET_PUBLIC_BASE="${NGROK_URL}"
    DESCRIPTION="LOCAL DEVELOPMENT VIA NGROK (Flutter & Callbacks both through ngrok)"
    ;;
  server)
    TARGET_API_URL="${SERVER_URL}/api"
    TARGET_PUBLIC_BASE="${SERVER_URL}"
    DESCRIPTION="PRODUCTION SERVER (Flutter & Callbacks via https://abdmapi.saritainfotech.com)"
    ;;
  *)
    echo "ERROR: Unknown environment: '$1'"
    echo "$USAGE"
    exit 1
    ;;
esac

echo "============================================================"
echo "Switching Sarita ABDM Environment to: $TARGET_ENV"
echo "Description: $DESCRIPTION"
echo "============================================================"

# 1. Update backend/.env safely without touching secrets
if [ -f "$BACKEND_ENV" ]; then
  # Remove any existing uncommented PUBLIC_BASE_URL lines
  sed -i.bak '/^PUBLIC_BASE_URL=/d' "$BACKEND_ENV"
  # Add new canonical PUBLIC_BASE_URL
  echo "PUBLIC_BASE_URL=${TARGET_PUBLIC_BASE}" >> "$BACKEND_ENV"
  rm -f "${BACKEND_ENV}.bak"
  echo "✔ Updated backend/.env: PUBLIC_BASE_URL=${TARGET_PUBLIC_BASE}"
else
  echo "⚠ Warning: backend/.env not found at $BACKEND_ENV"
fi

# 2. Update lib/utils/api_config.dart default value
if [ -f "$API_CONFIG_DART" ]; then
  python3 -c "
import re
path = '$API_CONFIG_DART'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

new_content = re.sub(
    r\"defaultValue:\s*'[^']*'\",
    \"defaultValue: '${TARGET_API_URL}'\",
    content
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)
"
  echo "✔ Updated lib/utils/api_config.dart: defaultValue: '${TARGET_API_URL}'"
else
  echo "⚠ Warning: api_config.dart not found at $API_CONFIG_DART"
fi

echo "============================================================"
echo "Active Configuration Summary:"
echo "  • Frontend Target API: ${TARGET_API_URL}"
echo "  • Backend Public URL:  ${TARGET_PUBLIC_BASE}"
echo "  • ABDM Gateway:        https://dev.abdm.gov.in (Preserved)"
echo "  • ABDM ABHA Sandbox:   https://Abhasbx.abdm.gov.in (Preserved)"
echo "============================================================"
echo "Done! You can now start or restart your frontend and backend."
