#!/usr/bin/env bash
# Agent Farm Dispatch
# 默认行为：
#   AGENT_FARM_GIT_WORKTREE=1 (默认) → 为每个任务创建独立 worktree
#   AGENT_FARM_GIT_WORKTREE=0/false → --shared-workspace（关闭 worktree，使用共享目录）
#   AGENT_FARM_AUTO_MERGE=1 (默认) → --auto-merge（任务完成后自动合并）
#   AGENT_FARM_AUTO_MERGE=0/false → 禁用自动合并
#   --workers 默认 4

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

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
  echo "agent-farm: run \"npm run build\" in repo root, or install: npm i -g agent-farm-cli" >&2
  exit 1
fi

# 与 project init --storage sqlite 一致，避免 shell 里残留 AGENT_FARM_STORAGE=jsonl
export AGENT_FARM_STORAGE=sqlite

PROMPT="${1:-}"
if [ -z "$PROMPT" ]; then
  echo "Usage: ./scripts/agent-farm-dispatch.sh \"task prompt\"" >&2
  exit 1
fi

TASK_ID="task-$(date +%s)"
DEDUPE_KEY="manual:${TASK_ID}"

EXECUTOR_COMMAND_TEMPLATE='npx --prefix="$AGENT_FARM_WORKSPACE_ROOT" opencode-ai run --pure --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions {prompt}'

"${AGENT_FARM[@]}" queue add --prompt "$PROMPT" --task-id "$TASK_ID" --dedupe-key "$DEDUPE_KEY"

WORKER_EXTRA=()
if [[ "${AGENT_FARM_GIT_WORKTREE:-}" == "0" || "${AGENT_FARM_GIT_WORKTREE:-}" == "false" ]]; then
  WORKER_EXTRA+=(--shared-workspace)
fi

"${AGENT_FARM[@]}" worker \
  --workspace "$ROOT" \
  --workers 4 \
  --command-template "${EXECUTOR_COMMAND_TEMPLATE}" \
  --lease-timeout-seconds 1800 \
  --poison-max-attempts 3 \
  "${WORKER_EXTRA[@]}"

"${AGENT_FARM[@]}" insights
"${AGENT_FARM[@]}" doctor
