#!/usr/bin/env bash
# =============================================================================
# agent-farm 开箱验收脚本（AI / 语义验收阶段）
# =============================================================================
#
# 位置：每条 task 在经过 execute → verify 后，进入此 AI review 阶段。
# 对应源码：
#   src/application/worker/process-claimed-task/stage-execute.ts   -- 执行阶段
#   src/application/worker/process-claimed-task/stage-verify.ts    -- 确定性验证阶段
#   src/application/worker/process-claimed-task/stage-ai-review.ts -- 本阶段（AI/语义验收）
#
# 模板占位符（定义于 src/application/worker/command-template.ts）：
#   {prompt}              -- 任务 prompt（JSON 转义后注入）
#   {task_id}             -- 任务 ID
#   {runs_dir}            -- 运行输出目录
#   {workspace}           -- worktree 工作区路径
#   {acceptance_criteria} -- 验收标准（JSON 转义后注入）
#
# 模板解析逻辑：src/application/worker/ai-review-template.ts
#   - skip_ai_review: true 的任务跳过本阶段
#   - 优先级：任务级 ai_review_command_template > worker --ai-review-command-template
#   - --require-ai-review 下缺失模板会 blocked
#
# Worker 注入的环境变量：
#   AGENT_FARM_TASK_ID       -- 任务 ID
#   AGENT_FARM_RUNS_DIR      -- 运行输出目录
#   AGENT_FARM_WORKSPACE     -- worktree 工作区路径（默认入口）
#   AGENT_FARM_PROMPT        -- 任务 prompt（原始文本）
#   AGENT_FARM_WORKSPACE_ROOT -- 主仓库根
#
# 退出码约定：
#   0 = 验收通过 → worker 标记 done（或进入 review 待人工确认）
#   非0 = 验收失败 → worker 进入 retry，prompt 末尾追加 [ai-review-fix] 块
#
# =============================================================================
# 自定义指南
# =============================================================================
# 替换下面的 stub 逻辑为你真实的验收器，例如：
#   1) 调用二次 LLM：读取 git diff + AGENT_FARM_PROMPT，要求输出 { "pass": true/false, "reason": "..." }
#   2) 确定性规则检查：rg 'forbidden_pattern' src/ && exit 1
#   3) 集成第三方分析：sonar-scanner / golangci-lint / 自定义静态分析
#   4) 参考本脚本的 stderr 输出格式，便于 worker 日志排查
# =============================================================================
set -euo pipefail

ROOT="${AGENT_FARM_WORKSPACE:-.}"
cd "$ROOT"

# ---- stub: 轻量基础检查（不改动行为，保持开箱可运行） ----

echo "[ai-review] task=${AGENT_FARM_TASK_ID:-?} workspace=${ROOT}" >&2

if [[ ! -d .git ]]; then
  echo "[ai-review] FAIL: .git 目录不存在于 AGENT_FARM_WORKSPACE=${ROOT}" >&2
  echo "[ai-review] 提示：worktree 未正确创建或任务目录非 git 仓库" >&2
  exit 1
fi

echo "[ai-review] PASS (stub) — 请将本脚本替换为真实验收逻辑" >&2
echo "[ai-review] 参见本文件顶部注释了解如何自定义" >&2
exit 0
