#!/usr/bin/env bash
# Wave JSON → 入队 → OpenCode worker（仅此流程）
set -euo pipefail

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
"${AGENT_FARM[@]}" worker \
  --workspace "$ROOT" \
  --workers 4 \
  --command-template "${EXECUTOR_COMMAND_TEMPLATE}" \
  --lease-timeout-seconds 1800 \
  --poison-max-attempts 3 \
  "${extra[@]}"
