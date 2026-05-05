#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

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

EXECUTOR_COMMAND_TEMPLATE='opencode run --dir . --dangerously-skip-permissions {prompt}'

"${AGENT_FARM[@]}" queue add --prompt "$PROMPT" --task-id "$TASK_ID" --dedupe-key "$DEDUPE_KEY"

"${AGENT_FARM[@]}" worker \
  --workspace "$ROOT" \
  --workers 4 \
  --command-template "${EXECUTOR_COMMAND_TEMPLATE}" \
  --lease-timeout-seconds 1800 \
  --poison-max-attempts 3

"${AGENT_FARM[@]}" insights
"${AGENT_FARM[@]}" doctor
