#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_ENV_FILE="$ROOT_DIR/ops/env/local.env"

if [[ -n "${RETAIL_OPS_ENV_FILE:-}" ]]; then
  ENV_FILE="$RETAIL_OPS_ENV_FILE"
elif [[ -z "${RETAIL_OPS_ENVIRONMENT:-}" && -f "$DEFAULT_ENV_FILE" ]]; then
  ENV_FILE="$DEFAULT_ENV_FILE"
else
  ENV_FILE=""
fi

if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

HOST="${RETAIL_OPS_HOST:-127.0.0.1}"
PORT="${RETAIL_OPS_PORT:-8000}"
BASE_URL="http://${HOST}:${PORT}"

printf 'health: '
curl -fsS "${BASE_URL}/api/v1/health"
printf '\n/app/: '
curl -fsS -o /dev/null "${BASE_URL}/app/"
printf '200 OK\n'
