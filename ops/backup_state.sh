#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
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

STATE_FILE="${RETAIL_OPS_STATE_FILE:-$ROOT_DIR/backend/data/runtime_state.json}"
BACKUP_DIR="${RETAIL_OPS_BACKUP_DIR:-$ROOT_DIR/backups/runtime/${RETAIL_OPS_ENVIRONMENT:-local}}"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "状态文件不存在：$STATE_FILE" >&2
  exit 1
fi

"$PYTHON_BIN" -m json.tool "$STATE_FILE" >/dev/null
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d_%H%M%S)"
TARGET_FILE="$BACKUP_DIR/runtime_state_${STAMP}.json"
cp "$STATE_FILE" "$TARGET_FILE"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$TARGET_FILE" > "${TARGET_FILE}.sha256"
fi

echo "已备份到：$TARGET_FILE"
