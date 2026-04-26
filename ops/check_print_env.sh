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

PRINTER_NAME="${RETAIL_OPS_PRINTER_NAME:-Deli DL-720C}"
NORMALIZED_TARGET="$(printf '%s' "$PRINTER_NAME" | tr '[:upper:]' '[:lower:]' | tr -d ' _-')"

for command_path in /usr/bin/lpstat /usr/bin/lp /usr/bin/lpoptions; do
  if [[ ! -x "$command_path" ]]; then
    echo "缺少系统打印命令：$command_path" >&2
    exit 1
  fi
done

echo "系统打印命令已就绪。"
echo "当前打印队列："
/usr/bin/lpstat -v || true
echo

MATCHED_PRINTER="$(/usr/bin/lpstat -v | awk -F'[:：]' '/device for |用于/ {print $1}' | sed -e 's/^device for //' -e 's/^用于//' -e 's/的设备$//' | while read -r candidate; do normalized="$(printf '%s' "$candidate" | tr '[:upper:]' '[:lower:]' | tr -d ' _-')"; if [[ "$normalized" == "$NORMALIZED_TARGET" ]]; then echo "$candidate"; break; fi; done)"

if [[ -n "$MATCHED_PRINTER" ]]; then
  echo "已找到目标标签机队列：$MATCHED_PRINTER"
else
  echo "未找到目标标签机队列：$PRINTER_NAME" >&2
  echo "请继续使用 TSPL raw printing，不要退回 generic A4/Letter 队列。" >&2
  exit 1
fi
