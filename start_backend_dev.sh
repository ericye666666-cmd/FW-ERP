#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_ENV_FILE="$ROOT_DIR/ops/env/local.env"
PYTHON_BIN="${RETAIL_OPS_PYTHON_BIN:-$ROOT_DIR/.venv/bin/python}"

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

export RETAIL_OPS_PROJECT_DIR="${RETAIL_OPS_PROJECT_DIR:-$ROOT_DIR}"
export RETAIL_OPS_BACKEND_DIR="${RETAIL_OPS_BACKEND_DIR:-$ROOT_DIR/backend}"
export RETAIL_OPS_FRONTEND_DIR="${RETAIL_OPS_FRONTEND_DIR:-$ROOT_DIR/frontend_prototype}"
export RETAIL_OPS_REACT_FRONTEND_DIR="${RETAIL_OPS_REACT_FRONTEND_DIR:-$ROOT_DIR/frontend_react_admin/dist}"
export RETAIL_OPS_DATA_DIR="${RETAIL_OPS_DATA_DIR:-$ROOT_DIR/backend/data}"
export RETAIL_OPS_STATE_FILE="${RETAIL_OPS_STATE_FILE:-$RETAIL_OPS_DATA_DIR/runtime_state.json}"
export RETAIL_OPS_HOST="${RETAIL_OPS_HOST:-127.0.0.1}"
export RETAIL_OPS_PORT="${RETAIL_OPS_PORT:-8000}"

mkdir -p "$(dirname "$RETAIL_OPS_STATE_FILE")"

cd "$ROOT_DIR/backend"
exec "$PYTHON_BIN" -m uvicorn app.main:app \
  --reload \
  --host "$RETAIL_OPS_HOST" \
  --port "$RETAIL_OPS_PORT"
