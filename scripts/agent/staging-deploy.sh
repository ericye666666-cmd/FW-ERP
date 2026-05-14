#!/usr/bin/env bash
set -euo pipefail

SSH_ALIAS="fw-erp-staging"

ssh "$SSH_ALIAS" 'bash -s' <<'REMOTE'
set -euo pipefail

REPO="/home/ericye666666/FW-ERP"
SERVICE="fw-erp.service"

BRANCH="$(sudo -n -u ericye666666 git -C "$REPO" branch --show-current)"
if [ "$BRANCH" != "main" ]; then
  echo "ERROR: staging repo is on branch '$BRANCH', expected 'main'."
  exit 1
fi

echo "Before deploy commit:"
sudo -n -u ericye666666 git -C "$REPO" rev-parse HEAD

STATUS="$(sudo -n -u ericye666666 git -C "$REPO" status --short)"
if [ -n "$STATUS" ]; then
  echo "ERROR: staging working tree is dirty. Stop deployment."
  echo "$STATUS"
  exit 1
fi

sudo -n -u ericye666666 git -C "$REPO" fetch origin main
sudo -n -u ericye666666 git -C "$REPO" reset --hard origin/main

sudo systemctl restart "$SERVICE"
sudo systemctl is-active --quiet "$SERVICE"

curl -fsS http://127.0.0.1:8000/docs >/dev/null
curl -fsS http://127.0.0.1:8000/openapi.json >/dev/null
curl -fsS http://127.0.0.1:8000/app/ >/dev/null

echo "After deploy commit:"
sudo -n -u ericye666666 git -C "$REPO" rev-parse HEAD
echo "STAGING DEPLOYMENT COMPLETED"
REMOTE
