#!/usr/bin/env bash
set -euo pipefail

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

EXECUTOR_COMMAND_TEMPLATE='claude -p {prompt} --output-format stream-json --dangerously-skip-permissions'

"${AGENT_FARM[@]}" queue add --prompt "$PROMPT" --task-id "$TASK_ID" --dedupe-key "$DEDUPE_KEY"

WORKER_EXTRA=()
if [[ "${AGENT_FARM_GIT_WORKTREE:-}" == "0" || "${AGENT_FARM_GIT_WORKTREE:-}" == "false" ]]; then
  WORKER_EXTRA+=(--shared-workspace)
fi
# 多路 opencode-ai 时按任务隔离 OPENCODE_DB 并启用 JSON events（仅当模板包含 opencode-ai 时启用）
if [[ "${EXECUTOR_COMMAND_TEMPLATE}" == *"opencode-ai"* ]]; then
  WORKER_EXTRA+=(--isolate-opencode-db --opencode-json-events)
# 多路 claude 时按任务隔离 CLAUDE_CONFIG_DIR 并启用 JSON events（仅当模板包含 claude 时启用）
elif [[ "${EXECUTOR_COMMAND_TEMPLATE}" == *"claude"* ]]; then
  WORKER_EXTRA+=(--isolate-claude-db --claude-json-events)
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
