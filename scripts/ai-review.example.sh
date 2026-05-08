#!/usr/bin/env bash
# 示例：由 `--ai-review-command-template` 调用；用退出码表示验收结果（0=通过，非0=失败并重试）。
# Worker 会设置：AGENT_FARM_TASK_ID, AGENT_FARM_RUNS_DIR, AGENT_FARM_WORKSPACE, AGENT_FARM_PROMPT
set -euo pipefail

ROOT="${AGENT_FARM_WORKSPACE:-.}"
cd "$ROOT"

# TODO: 替换为你的验收器，例如：
# - 调用二次 LLM：读取 git diff + AGENT_FARM_PROMPT，输出 JSON { "pass": true } 并校验
# - 或仅做确定性检查：test -f some-file && rg 'forbidden' src && exit 1

if [[ ! -d .git ]]; then
  echo "ai-review: no .git under AGENT_FARM_WORKSPACE" >&2
  exit 1
fi

echo "ai-review: ok (stub) task=${AGENT_FARM_TASK_ID:-}"
exit 0
