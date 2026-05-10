#!/usr/bin/env bash
# One-click: re-init project + enqueue wave + start worker
# 适合中断后继续：重新初始化环境后批量入队并启动 worker
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[init-and-dispatch] 重新初始化项目环境..." >&2
npm run farm:init --prefix "$ROOT"

echo "[init-and-dispatch] 批量入队并启动 worker..." >&2
exec "$SCRIPT_DIR/agent-farm-dispatch-batch.sh" "$@"
