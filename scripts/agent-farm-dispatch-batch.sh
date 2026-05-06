#!/usr/bin/env bash
# 批量入队 + 并行 worker（与 agent-farm-dispatch.sh 相同 executor 约定）
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
  echo "agent-farm: 请在仓库根执行 npm run build，或全局安装 agent-farm-cli" >&2
  exit 1
fi

export AGENT_FARM_STORAGE=sqlite

MODE="${1:-all}"
WAVE_JSON="${2:-$ROOT/scripts/waves/optimization-wave.json}"

EXECUTOR_COMMAND_TEMPLATE='npx --prefix="$AGENT_FARM_WORKSPACE" opencode-ai run --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions {prompt}'

enqueue_wave() {
  node "$ROOT/scripts/enqueue-task-wave.mjs" "$WAVE_JSON"
}

run_worker() {
  "${AGENT_FARM[@]}" worker \
    --workspace "$ROOT" \
    --workers 4 \
    --command-template "${EXECUTOR_COMMAND_TEMPLATE}" \
    --lease-timeout-seconds 1800 \
    --poison-max-attempts 3
}

case "$MODE" in
  enqueue)
    enqueue_wave
    ;;
  worker)
    run_worker
    ;;
  all)
    enqueue_wave
    run_worker
    "${AGENT_FARM[@]}" insights
    "${AGENT_FARM[@]}" doctor
    ;;
  *)
    echo "Usage: $0 enqueue|worker|all [wave.json 路径，默认 scripts/waves/optimization-wave.json]" >&2
    exit 1
    ;;
esac
