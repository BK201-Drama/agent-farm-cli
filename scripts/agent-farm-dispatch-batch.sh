#!/usr/bin/env bash
# Wave JSON → 入队 → OpenCode worker
# 默认行为：
#   AGENT_FARM_GIT_WORKTREE=1 (默认) → 为每个任务创建独立 worktree
#   AGENT_FARM_GIT_WORKTREE=0/false → --shared-workspace（关闭 worktree）
#   AGENT_FARM_AUTO_MERGE=1 (默认) → --auto-merge（任务完成后自动合并）
#   AGENT_FARM_AUTO_MERGE=0/false → 禁用自动合并
#   --workers 默认 4，--isolate-opencode-db 默认启用

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

WAVE_JSON="${1:-}"
if [[ -z "$WAVE_JSON" ]]; then
  echo "Usage: $0 <wave.json>" >&2
  echo "  1. 在 .agent-farm/waves/ 下创建 JSON" >&2
  echo "  2. 传入路径：$0 .agent-farm/waves/my-tasks.json" >&2
  exit 1
fi

PROFILE="$ROOT/.agent-farm/profile.env"
if [[ -f "$PROFILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$PROFILE"
  set +a
fi
export PATH="$ROOT/node_modules/.bin:${PATH:-}"

if [[ -f "$ROOT/dist/interfaces/cli/index.js" ]]; then
  AGENT_FARM=(node "$ROOT/dist/interfaces/cli/index.js")
elif command -v agent-farm >/dev/null 2>&1; then
  AGENT_FARM=(agent-farm)
else
  echo "agent-farm: 请在仓库根执行 npm run build，或全局安装 agent-farm-cli" >&2
  exit 1
fi

export AGENT_FARM_STORAGE=sqlite

EXECUTOR_COMMAND_TEMPLATE='npx --prefix="$AGENT_FARM_WORKSPACE_ROOT" opencode-ai run --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions {prompt}'

node "$ROOT/scripts/enqueue-task-wave.mjs" "$WAVE_JSON"

extra=()
if [[ "${AGENT_FARM_GIT_WORKTREE:-}" == "0" || "${AGENT_FARM_GIT_WORKTREE:-}" == "false" ]]; then
  extra+=(--shared-workspace)
fi
extra+=(--isolate-opencode-db)
if [[ "${AGENT_FARM_AUTO_MERGE:-}" != "0" && "${AGENT_FARM_AUTO_MERGE:-}" != "false" ]]; then
  extra+=(--auto-merge)
fi
"${AGENT_FARM[@]}" worker \
  --workspace "$ROOT" \
  --workers 4 \
  --command-template "${EXECUTOR_COMMAND_TEMPLATE}" \
  --lease-timeout-seconds 1800 \
  --poison-max-attempts 3 \
  "${extra[@]}"
