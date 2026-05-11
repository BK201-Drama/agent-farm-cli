@echo off
REM =============================================================================
REM agent-farm 开箱验收脚本（AI / 语义验收阶段）— Windows 版
REM =============================================================================
REM
REM 位置：每条 task 在经过 execute → verify 后，进入此 AI review 阶段。
REM 对应源码：
REM   src/application/worker/process-claimed-task/stage-execute.ts   -- 执行阶段
REM   src/application/worker/process-claimed-task/stage-verify.ts    -- 确定性验证阶段
REM   src/application/worker/process-claimed-task/stage-ai-review.ts -- 本阶段（AI/语义验收）
REM
REM 模板占位符（定义于 src/application/worker/command-template.ts）：
REM   {prompt}              -- 任务 prompt（JSON 转义后注入）
REM   {task_id}             -- 任务 ID
REM   {runs_dir}            -- 运行输出目录
REM   {workspace}           -- worktree 工作区路径
REM   {acceptance_criteria} -- 验收标准（JSON 转义后注入）
REM
REM 模板解析逻辑：src/application/worker/ai-review-template.ts
REM   - skip_ai_review: true 的任务跳过本阶段
REM   - 优先级：任务级 ai_review_command_template > worker --ai-review-command-template
REM   - --require-ai-review 下缺失模板会 blocked
REM
REM Worker 注入的环境变量：
REM   AGENT_FARM_TASK_ID        -- 任务 ID
REM   AGENT_FARM_RUNS_DIR       -- 运行输出目录
REM   AGENT_FARM_WORKSPACE      -- worktree 工作区路径（默认入口）
REM   AGENT_FARM_PROMPT         -- 任务 prompt（原始文本）
REM   AGENT_FARM_WORKSPACE_ROOT -- 主仓库根
REM
REM 退出码约定：
REM   0 = 验收通过 → worker 标记 done（或进入 review 待人工确认）
REM   非0 = 验收失败 → worker 进入 retry，prompt 末尾追加 [ai-review-fix] 块
REM
REM 使用方式（worker 启动时指定）：
REM   agent-farm worker --ai-review-command-template "scripts\ai-review.example.cmd"
REM
REM =============================================================================
REM 自定义指南
REM =============================================================================
REM 替换下面的 stub 逻辑为你真实的验收器，例如：
REM   1) 调用二次 LLM：读取 git diff + AGENT_FARM_PROMPT，要求输出 { "pass": true/false, "reason": "..." }
REM   2) 确定性规则检查：findstr /s "forbidden_pattern" src\*.ts && exit /b 1
REM   3) 集成第三方分析：sonar-scanner / golangci-lint / 自定义静态分析
REM   4) 参考本脚本的 stderr 输出格式，便于 worker 日志排查
REM =============================================================================
setlocal enabledelayedexpansion

if defined AGENT_FARM_WORKSPACE (
    set "ROOT=%AGENT_FARM_WORKSPACE%"
) else (
    set "ROOT=."
)

cd /d "%ROOT%" 2>nul || (
    echo [ai-review] FAIL: 无法进入工作区 ROOT=!ROOT! >&2
    exit /b 1
)

REM ---- stub: 轻量基础检查（不改动行为，保持开箱可运行） ----

echo [ai-review] task=%AGENT_FARM_TASK_ID% workspace=%ROOT% >&2

if not exist ".git" (
    echo [ai-review] FAIL: .git 目录不存在于 AGENT_FARM_WORKSPACE=%ROOT% >&2
    echo [ai-review] 提示：worktree 未正确创建或任务目录非 git 仓库 >&2
    exit /b 1
)

echo [ai-review] PASS ^(stub^) -- 请将本脚本替换为真实验收逻辑 >&2
echo [ai-review] 参见本文件顶部注释了解如何自定义 >&2
exit /b 0
