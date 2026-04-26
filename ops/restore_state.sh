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

if [[ $# -lt 2 ]]; then
  echo "用法：$0 <backup-json-path> --yes-overwrite" >&2
  exit 1
fi

SOURCE_FILE="$1"
CONFIRM_FLAG="$2"
STATE_FILE="${RETAIL_OPS_STATE_FILE:-$ROOT_DIR/backend/data/runtime_state.json}"
BACKUP_DIR="${RETAIL_OPS_BACKUP_DIR:-$ROOT_DIR/backups/runtime/${RETAIL_OPS_ENVIRONMENT:-local}}"
HOST="${RETAIL_OPS_HOST:-127.0.0.1}"
PORT="${RETAIL_OPS_PORT:-8000}"

if [[ "$CONFIRM_FLAG" != "--yes-overwrite" ]]; then
  echo "恢复会覆盖当前状态文件：$STATE_FILE" >&2
  echo "请明确传入 --yes-overwrite" >&2
  exit 1
fi

if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "备份文件不存在：$SOURCE_FILE" >&2
  exit 1
fi

if curl -fsS "http://${HOST}:${PORT}/api/v1/health" >/dev/null 2>&1; then
  echo "检测到服务仍在运行：${HOST}:${PORT}" >&2
  echo "请先停服务，再恢复，避免运行中的进程覆盖恢复结果。" >&2
  exit 1
fi

"$PYTHON_BIN" -m json.tool "$SOURCE_FILE" >/dev/null
mkdir -p "$(dirname "$STATE_FILE")" "$BACKUP_DIR"

if [[ -f "$STATE_FILE" ]]; then
  PRE_RESTORE_FILE="$BACKUP_DIR/pre_restore_$(date +%Y%m%d_%H%M%S).json"
  cp "$STATE_FILE" "$PRE_RESTORE_FILE"
  echo "已先备份当前状态到：$PRE_RESTORE_FILE"
fi

cp "$SOURCE_FILE" "$STATE_FILE"
echo "已恢复到：$STATE_FILE"
