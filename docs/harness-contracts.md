# Harness 契约（CLI / 任务 JSON）

面向把 agent-farm 当「调度 harness」嵌入脚本或 CI 的约定；与具体执行器（OpenCode 等）无关。人类可读的协作叙事见 **`docs/agents/README.md`**；安装、命令与集成长文见 **`docs/user-guide/README.md`**（中英分章）。控制面 HTTP API 与 MCP 工具见 **`docs/integrations/cursor-control-plane.md`**。第二轮拓展任务见 **`docs/roadmap-phase2-personal-team-ci.md`**。

## 任务 JSON（wave / `queue add --task-json`）

- **机器可读校验**：仓库根 `schemas/wave-task-item.schema.json`（Draft 2020-12）。可用任意校验器（如 `ajv-cli`）在入队前检查 wave 文件。
- **必填**：`task_id`、`dedupe_key`、`prompt`（与入队脚本一致；空 `dedupe_key` 会被拒绝）。
- **官方示例**：[`examples/waves/team-handoff-min.json`](../examples/waves/team-handoff-min.json)（plan + execute 最小交接）。
- **常用可选**：`mode`、`priority`、`acceptance_criteria`、`skip_ai_review`、`ai_review_command_template`。
- **每任务覆盖执行器模板**（非空字符串时生效，否则沿用 worker 全局参数）：
  - `execute_command_template` → 覆盖 `--command-template`
  - `verify_command_template` → 覆盖 `--verify-command-template`
  - `ai_review_command_template` → 覆盖 `--ai-review-command-template`（既有行为）

占位符与 worker 一致：`{prompt}`、`{task_id}`、`{workspace}`、`{runs_dir}`、`{acceptance_criteria}`、`{git_diff}`、`{git_diff_name_status}`（后两者在 execute/verify 展开时由运行时注入）。

## CLI 退出码

- **成功**：子命令正常完成时为 **0**。
- **失败**：未捕获异常由根 `index.ts` 统一打印 `{ ok: false, error }` 并以 **1** 退出（参数错误、存储错误、JSON 解析失败等）。
- **`doctor`**：默认不因不健康而非零退出；使用 **`doctor --ci-exit`**（与 **`--brief` 互斥）时，若存在 dedupe 碰撞、stale running、review 超期、heartbeat 异常或 sqlite 探针失败等，在输出完整 JSON 后 **退出码 1**（stderr 含简短原因）。见 **`docs/integrations/github-actions-health.md`\*\*。
- **`insights`**：不因队列状态单独设非零码；结果在 JSON 或 **`--brief` stderr** 中体现。
- **`stuck retry`**：将任务从 **`running` / `claimed` / `failed` / `rejected`** 置为 **`retry`**，递增 **`attempt`**，清除 **`claimed_*` / `heartbeat_at`**；非法态返回 **`ok: false`** 且退出码 **1**。见 **`docs/product-trust-sprint.md`**。

## Execute 阶段报告（信任感）

- 路径：**`.agent-farm/runs/<task_id>/execute-<attempt>.json`**
- 字段：`schema_version`（当前 **1**）、`exit_code`、`output_bytes`、`output_preview` 等。
- 查看：`agent-farm queue show <task-id> --with-execute-reports` 或 **`--timeline`**（事件 + execute 报告按时间合并）。
- **plan / execute / verify 契约**（`npm run validate:waves`）：`mode=plan` 时 prompt 须含「验收」或非空 `acceptance_criteria`；`mode=execute` / 默认须非空 `acceptance_criteria`；`mode=verify` 须非空 `acceptance_criteria` 且 prompt 含验收/检查或提供 `verify_command_template`。校验范围：`examples/waves` 与 `.agent-farm/waves`（跳过 `_` 前缀文件）。**严格 prompt lint**：`npm run validate:waves:strict`；CI 对官方样例跑 **`npm run validate:waves:strict:examples`**。写作指南：**`docs/agents/wave-prompt-playbook.md`**。
- **节点阶段报告**（`schemas/node-stage-report.schema.json`）：worker 写入 `runs/<task_id>/execute-<n>.json` 等；本地校验 **`npm run validate:reports`**。
- **空转检测**（worker execute）：默认宽限 **10 分钟**（`AGENT_FARM_EMPTY_RUN_GRACE_MINUTES`）；配置见 `.agent-farm/config.json` 的 `empty_run` 与任务字段 `empty_run_grace_minutes` / `empty_run_disabled`。触发后 **retry 一次**（`[empty-run-fix]`），再失败则 `failed`。

## 人类可读输出（`--brief`）

- **`doctor --brief` / `insights --brief`**：摘要多行写入 **stderr**；**不**向 stdout 输出 JSON（与根目录 `AGENTS.md` 及 **`docs/agents/doctor-insights-brief.md`** 的 UX 约定一致）。
- **`--output-file`**：写入完整 JSON 时不受 `--brief` 影响。

## 兼容性

- 新增任务字段应为**可选**，旧 worker 忽略未知键；破坏性变更应 semver 主版本升级并更新本文件与 Schema。
