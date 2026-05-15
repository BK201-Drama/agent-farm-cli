# Harness 契约（CLI / 任务 JSON）

面向把 agent-farm 当「调度 harness」嵌入脚本或 CI 的约定；与具体执行器（OpenCode 等）无关。人类可读的协作叙事见 **`docs/agents/README.md`**；安装、命令与集成长文见 **`docs/user-guide/README.md`**（中英分章）。

## 任务 JSON（wave / `queue add --task-json`）

- **机器可读校验**：仓库根 `schemas/wave-task-item.schema.json`（Draft 2020-12）。可用任意校验器（如 `ajv-cli`）在入队前检查 wave 文件。
- **必填**：`task_id`、`dedupe_key`、`prompt`（与入队脚本一致；空 `dedupe_key` 会被拒绝）。
- **常用可选**：`mode`、`priority`、`acceptance_criteria`、`skip_ai_review`、`ai_review_command_template`。
- **每任务覆盖执行器模板**（非空字符串时生效，否则沿用 worker 全局参数）：
  - `execute_command_template` → 覆盖 `--command-template`
  - `verify_command_template` → 覆盖 `--verify-command-template`
  - `ai_review_command_template` → 覆盖 `--ai-review-command-template`（既有行为）

占位符与 worker 一致：`{prompt}`、`{task_id}`、`{workspace}`、`{runs_dir}`、`{acceptance_criteria}`、`{git_diff}`、`{git_diff_name_status}`（后两者在 execute/verify 展开时由运行时注入）。

## CLI 退出码

- **成功**：子命令正常完成时为 **0**。
- **失败**：未捕获异常由根 `index.ts` 统一打印 `{ ok: false, error }` 并以 **1** 退出（参数错误、存储错误、JSON 解析失败等）。
- **`doctor` / `insights`**：当前实现不因「队列不健康」而单独设非零码；巡检结果在 **stdout 的 JSON** 或 **`--brief` 的 stderr** 中体现。若需在 CI 中对重复 `dedupe_key` 等硬失败，请用 `jq` 等解析 JSON 后自行判断。

## 人类可读输出（`--brief`）

- **`doctor --brief` / `insights --brief`**：摘要多行写入 **stderr**；**不**向 stdout 输出 JSON（与根目录 `AGENTS.md` 及 **`docs/agents/doctor-insights-brief.md`** 的 UX 约定一致）。
- **`--output-file`**：写入完整 JSON 时不受 `--brief` 影响。

## 兼容性

- 新增任务字段应为**可选**，旧 worker 忽略未知键；破坏性变更应 semver 主版本升级并更新本文件与 Schema。
