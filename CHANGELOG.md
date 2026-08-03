# Changelog

All notable changes to agent-farm-cli will be documented in this file.

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- **Executor：Codex CLI 一流接入** — preset `codex exec --json --ephemeral --skip-git-repo-check --sandbox danger-full-access {prompt}`；worker `--codex-json-events` / `AGENT_FARM_CODEX_JSON_EVENTS`；NDJSON 观察与 `[codex-heal]`；health probe 识别 `codex`。
- **Executor：Cursor Agent CLI（headless）一流接入** — preset `agent -p --force --trust --output-format stream-json {prompt}`（别名 `agent` / `cursor_agent`）；worker `--cursor-agent-json-events` / `AGENT_FARM_CURSOR_AGENT_JSON_EVENTS`；NDJSON 观察与 `[cursor-agent-heal]`；Windows 探测 `%LOCALAPPDATA%\cursor-agent`，Git Bash 下自动改写为 `agent.cmd` 绝对路径。
- **Dispatch** — `agent-farm-dispatch(.mjs|.sh)` / batch：自动检测 `codex` / `cursor-agent`，注入对应 json-events；`cursor-sdk` 不再错误回退到 Claude template。

### Changed

- OpenCode / Claude 行为保持兼容；shell runner 按模板选择流观察器（opencode → claude → codex → cursor-agent）。

## [0.1.72] — 2026-06-06

## [0.1.71] — 2026-06-06

## [0.1.70] — 2026-06-05

## [0.1.69] — 2026-06-05

## [0.1.68] — 2026-06-05

## [0.1.67] — 2026-05-27

## [0.1.66] — 2026-05-27

## [0.1.65] — 2026-05-25

## [0.1.64] — 2026-05-25

## [0.1.63] — 2026-05-24

## [0.1.59] — 2026-05-24

## [0.1.58] — 2026-05-24

## [0.1.57] — 2026-05-22

## [0.1.56] — 2026-05-22

## [0.1.55] — 2026-05-22

## [0.1.46] — 2026-05-16

### Added

- **Worker 空转检测**：execute 宽限默认 **10 分钟**（`AGENT_FARM_EMPTY_RUN_*`、`.agent-farm/config.json`、`empty_run_grace_minutes`）；无 git diff + OpenCode 输出不足 + 无 execute 报告时中止子进程，**retry 一次**（`[empty-run-fix]`），再失败则 `failed`。事件：`task_empty_run_abort` / `task_empty_run_retry`；**`stuck list`** 含 `empty_run`。
- **Wave / Prompt 质量**：统一 **`scripts/lib/wave-validate.mjs`** + **`wave-prompt-lint`**；**`enqueue-task-wave`** 与 **`queue add --task-json`** 入队前校验。
- **校验脚本**：**`validate:waves`**（`examples/waves` + `.agent-farm/waves`）；**`validate:waves:strict`**；CI 跑 **`validate:waves:strict:examples`**。
- **迁移脚本**：**`migrate:waves:acceptance`**、**`migrate:waves:prompt-hints`**。
- **文档 / 样例**：**[`docs/agents/wave-prompt-playbook.md`](./docs/agents/wave-prompt-playbook.md)**；**`examples/waves/plan-execute-feature.json`**；**`examples/waves/templates/`**；**`examples/agent-farm/config.json.example`**。
- **AI 验收**：未开 `--require-ai-review` 时，仅 **diff ≥ 200 行**（`AGENT_FARM_AI_REVIEW_MIN_DIFF_LINES`）才跑全局 ai-review；事件 `task_ai_review_skipped`。

### Changed

- **`validate:waves`** 实现改为 **`scripts/validate-waves.mjs`**（原 `validate-example-waves.mjs` 为薄包装）。

## [0.1.45] — 2026-05-16

### Fixed

- **CI / Linux**：`process-claimed-task` 测试改用临时 `runsDir`，避免写入 `/runs` 导致 EACCES。
- **Worker**：execute 报告写入失败时不再阻断任务（返回 `null`）。

## [0.1.44] — 2026-05-16

### Added

- **CLI**：**`stuck list` / `stuck retry` / `stuck recover`** — 卡住任务中心（聚合 doctor + 一键重回 `retry`）。
- **CLI**：**`queue show <id> --timeline`** — 任务事件与 **execute-\*.json** 按时间合并（replay）。
- **Worker**：execute 结束写入 **`.agent-farm/runs/<task_id>/execute-<attempt>.json`**（结构化报告）。
- **Dashboard**：顶栏 **`⚠stuck:N`** 风险计数。
- **脚本**：**`npm run farm:stuck`**、**`npm run farm:status:line`**（Cursor 状态行）；**`npm run health:cron:dispatch`**（需 `gh auth`）。
- **校验**：**`validate:waves`** 增加 **plan/execute** 验收契约规则。
- **文档**：**[`docs/product-trust-sprint.md`](./docs/product-trust-sprint.md)**。

## [0.1.43] — 2026-05-16

### Added

- **脚本**：**`npm run farm:doctor:ci`**、**`npm run validate:waves`**（校验 `examples/waves/*.json`）。
- **BDD**：**`project-init-defaults`**、**`personal-team-ci-chain`**（demo → doctor → ci-health-local）；**`demo task --template check`**。
- **测试**：**`test/examples/example-waves-schema.test.ts`**、**`test/packaging/npm-files.test.ts`**；`InitProjectUseCase` skip 标志单测。
- **文档**：**[`docs/roadmap-phase2-personal-team-ci.md`](./docs/roadmap-phase2-personal-team-ci.md)**（第二轮 40 项索引）；README 快速验收；integrations **`doctor --ci-exit`** 规则表。
- **CI**：主 **`ci.yml`** 增加 **`validate:waves`**。

## [0.1.42] — 2026-05-16

### Added

- **脚本**：**`npm run ci:health:local`**（`scripts/ci-health-local.mjs`）— 本地 jsonl 临时队列上跑 **`doctor --ci-exit`** + **`insights`**；**dist 优先、tsx 兜底**。
- **脚本**：**`npm run test:bdd`**；**`prepublishOnly`** 含 BDD 与 `ci:health:local`。
- **示例**：**`examples/waves/team-handoff-min.json`** 与 **`examples/waves/README.md`**；随 npm 包发布（`files` 含 **`examples`**）。
- **BDD**：**`test/bdd/`** — 个人上手（含 unhealthy / dashboard）、团队 wave + enqueue 冒烟、`ci-health-local`。
- **CLI**：**`project init`** 默认写入 **`.agent-farm/waves/team-handoff-min.example.json`** 与 **`.github/workflows/agent-farm-health.yml`**（`--skip-example-wave` / `--skip-health-workflow` 可关）。
- **文档**：中英协作文档（含 mermaid）、**个人 5 分钟**清单、**[`docs/contributing-pr.md`](./docs/contributing-pr.md)**、**harness-contracts** 补充 **`doctor --ci-exit`**。
- **CI**：health cron 增加 **`ci:health:local`** 狗食；**insights** `continue-on-error`；主 **`ci.yml`** 跑 BDD + `ci:health:local`。

## [0.1.41] — 2026-05-16

### Added

- **CLI**：**`doctor --ci-exit`**（与 **`--brief` 互斥**）：输出完整 JSON 后，若存在 dedupe 碰撞、stale running、review 超期、heartbeat 异常或 sqlite 探针失败等，则 **退出码 1**；逻辑见 **`interfaces/cli/doctor-ci-guards.ts`**。
- **CLI**：**`demo task`**（**`--template noop|check`**），**`task_id` / `dedupe_key`** 使用 **`demo-onboarding-*`** 前缀，便于与真实任务区分。
- **CI**：**`.github/workflows/agent-farm-health-cron.yml`**（每周一 cron + `workflow_dispatch`），失败时创建或跟帖 **`[agent-farm] Health check failed`** issue。
- **文档**：**`docs/integrations/github-actions-health.md`**（中英对照：巡检规则、矩阵扩展、`demo task`）。

## [0.1.40] — 2026-05-16

### Changed

- **CLI**：**`doctor`** 实现迁至 **`register/doctor-action.ts`**（**`runDoctorCli`**），**`doctor.ts`** 仅保留选项注册与 **`import()`**，冷路径不再同步加载 **better-sqlite3** / **opencode** 探针与 **`doctorService`** 依赖链。

## [0.1.39] — 2026-05-16

### Changed

- **CLI**：**`skill install`** 在 **`action`** 内动态加载 **`skill-md`** 模板，避免冷路径拉取 SKILL 正文。
- **CLI**：**`queue worktree-cleanup`** 实现迁至 **`register/queue/worktree-cleanup-action.ts`**（**`runQueueWorktreeCleanupCli`**），**`worktree-cleanup.ts`** 仅保留注册与 **`import()`**，减轻未执行该子命令时的依赖图。

## [0.1.38] — 2026-05-16

### Changed

- **CLI**：**`project init`** 的重依赖（`InitProjectUseCase`、node 初始化网关、**`skill-md`** 模板、**`init-markdown`**）迁至 **`register/project-init-action.ts`**，由 **`register/project.ts`** 在命令 **`action`** 内 **`import()`** 懒加载，减轻非 `project` 子命令的启动依赖图。

## [0.1.37] — 2026-05-16

### Changed

- **CLI**：`print.ts` 新增 **`writePrettyJsonReportIfPath`**，`doctor` / `insights` / `status` 的 **`--output-file`** 共用同一写入逻辑（pretty JSON + 末尾换行，与 `print()` 一致）。

### Added

- **测试**：`test/cli/print-json-output.test.ts`。

## [0.1.36] — 2026-05-16

### Changed

- **CLI**：新增 **`interfaces/cli/brief-stderr.ts`**，抽取 `status` / `insights` / `doctor` 的 **`--brief`** 共用逻辑（状态计数行、失败列表截断、`stderr` 写出）；`register/status.ts`、`insights.ts`、`doctor.ts` 改为调用该模块。

### Added

- **测试**：`test/cli/brief-stderr.test.ts` 覆盖截断与格式化纯函数。

## [0.1.35] — 2026-05-16

### Changed

- **CLI**：新增 **`interfaces/cli/default-queue-container.ts`**（`createCliQueueContainer`），统一 `dashboard` / `doctor` / `insights` / `status` / `worker` 与 `queue` 子命令的默认 task/event/quarantine 装配，减少对 `bootstrap` 的重复样板导入。

## [0.1.34] — 2026-05-16

### Changed

- **分层**：`createDefaultStorageContainer` 从 `interfaces/cli/compose.ts` 迁至 **`bootstrap/default-storage-container.ts`**；CLI `register/*` 仅从 bootstrap 取容器；删除未使用的 `getContainer` 与 **`compose.ts`**。
- **文档**：`docs/agents/source-layout`、用户指南目录树与「替换存储」步骤同步上述边界。

## [0.1.33] — 2026-05-16

### Changed

- **文档**：根 `README` 瘦身为入口表；长文迁至 **`docs/user-guide/`**（`zh/`、`en/` 成对章节 + 索引导航）。
- **CLI**：`dashboard` / `ui` 对 Ink 看板 **`import()` 懒加载**；`docs/agents`、`harness-contracts` 与用户指南交叉链接。

## [0.1.32] — 2026-05-15

### Changed

- **文档**：`AGENTS.md` 改为薄入口；协作细则拆至 **`docs/agents/`**（索引导航 + 分主题 md）；`docs/harness-contracts.md` 增加与 `docs/agents` 的交叉引用。

## [0.1.31] — 2026-05-15

### Added

- **Harness**：任务可选 `execute_command_template`、`verify_command_template`（非空时分别覆盖 worker 全局 execute / verify 模板）；`schemas/wave-task-item.schema.json` 与 `docs/harness-contracts.md`；发布物 `files` 包含 `schemas`、`docs`。
- **测试**：`processClaimedTask` 对每任务 execute / verify 覆盖的回归；wave 夹具类型校验扩展。

## [0.1.30] — 2026-05-11

### Added

- **Worker / Shell**：可选子进程超时 `AGENT_FARM_SHELL_TIMEOUT_MS` 与 CLI `--shell-timeout-ms`（execute / verify / ai-review 共用）。超时后结束子进程，输出 `[agent-farm] shell exceeded …ms`，退出码 **124**，任务进入 **retry**，避免 Windows 上 bash/管道僵死导致永久 **`running`**。Windows 超时额外使用 **`taskkill /T /F`** 结束进程树。
- `test/infrastructure/shell-timeout.test.ts` 回归。

## [0.1.29] — 2026-05-10

### Fixed

- **Doctor / insights `--brief`**：`AGENT_FARM_STORAGE=jsonl` 时不再误报「sqlite: ok」；管线空闲时 `insights --brief` 增加下一步命令提示。
- **Worker auto-merge**：`git merge` 失败时额外输出一行 stderr 排错指引（`task_merge_failed`、`doctor`、`queue list`）。

### Added

- `npm run farm:session:wave`：一键 build 后对本仓库 `test/fixtures/waves/polish-opencode-session-20260510.json` 入队并启动 OpenCode worker（需 `.agent-farm/profile.env` 或环境中已有模型 API 密钥）。
- `test/cli/doctor-insights-brief-cli.test.ts` 与 wave 夹具 `polish-opencode-session-20260510.json`。

## [0.1.28] — 2026-05-10

### Fixed

- **Dispatch**：单条派活 `agent-farm-dispatch.mjs` 与 `agent-farm-dispatch.sh` 在未设置 `AGENT_FARM_AUTO_MERGE=0` 时默认附带 `--auto-merge`，与 `agent-farm-dispatch-batch.*` 及脚本头注释一致。

### Added

- 可提交的 wave 示例 `test/fixtures/waves/polish-backlog-20260510.json`（并行打磨 backlog）及 `test/scripts/dispatch-parity.test.ts` 防回归。

## [0.1.27] — 2026-05-10

### Fixed

- **Dashboard**：`since` 列不再跟随 15s 心跳刷新，仅任务状态变化时更新。
- **Dashboard**：修复 Windows 终端下 Ink `log-update` 组件堆叠导致的闪烁问题。

## [0.1.26] — 2026-05-10

### Added

- **OpenCode --pure**：dispatch 脚本与 executor preset 默认启用 `opencode-ai run --pure`，避免工作区文件污染。
- **SQLite 运行时 rebuild**：`better-sqlite3` 改为 lazy-load，NODE_MODULE_VERSION 不匹配时自动尝试 `npm rebuild`。
- **Dashboard**：仓库外执行时给出全局 CLI 安装提示；加载失败时输出 ABI 副本信息。

### Fixed

- Worker 任务恢复逻辑与事务处理增强。
- Doctor 与 worktree 管理健壮性提升。

## [0.1.25] — 2026-05-09

### Fixed

- 测试夹具路径修复：wave fixtures 迁移至 `test/fixtures/`。

## [0.1.24] — 2026-05-09

### Added

- **Worktree snapshot commit**：拆除 worktree 前自动 `git add -A` + `git commit`，确保改动不丢失。支持 `AGENT_FARM_WORKTREE_SNAPSHOT_FORCE_ADD` 等环境变量控制。
- **Auto-merge**：`worker --auto-merge`（或 `AGENT_FARM_AUTO_MERGE=1`）在任务完成且 approve 后，自动将分支合并到当前检出分支。冲突时支持 stash 辅助。
- Git 合并增强：自动 stash 未提交改动，合并后恢复。

### Changed

- Wave 相关示例与脚本清理，移除废弃脚本。

## [0.1.22] — 2026-05-08

### Added

- **Wave 工作流收敛**：`.agent-farm/waves/` 作为 wave JSON 唯一来源；`npm run farm:wave` / `agent-farm-dispatch-batch.mjs` 单一入口入队并启动 worker。
- `queue add --task-json` 支持完整 JSON 入队。

### Removed

- 包内示例 wave 文件与 init 默认写入的 JSON（避免发布物携带业务模板）。

## [0.1.21] — 2026-05-08

### Added

- **OpenCode DB 隔离**：`--isolate-opencode-db`（或 `AGENT_FARM_ISOLATE_OPENCODE_DB=1`）为每条任务设置独立 `OPENCODE_DB`，路径为 `<workspace>/.agent-farm/opencode-db/<task_id>.db`，解决并行 worker 时的 SQLite WAL 竞争。

### Fixed

- Worker 任务失败处理与重试逻辑增强。

## [0.1.20] — 2026-05-08

### Changed

- Worker 内部重构：`claimed-task` 包化，dashboard helpers/nav 拆分。
- 任务处理增强：新增重试诊断与 worktree 目录管理。

## [0.1.19] — 2026-05-08

### Added

- **OpenCode NDJSON 可观测**：`worker --opencode-json-events`（或 `AGENT_FARM_OPENCODE_JSON_EVENTS=1`）对 execute / verify / ai-review 三阶段按行解析 JSON 流，失败时写入 `task_opencode_stream_diag` 事件，并注入 `[opencode-heal]` 提示自愈。
- **Doctor 扩展**：新增 `opencode_cli` 探针、heal prompt 计数、按 stage 聚合的 stream_diag 统计。

## [0.1.18] — 2026-05-08

### Added

- **Git worktree 默认开启**：`agent-farm worker` 为每条任务在 `.agent-farm/worktrees/<task-id>` 独立检出 + 创建分支 `agent-farm/<task-id>`，实现多 worker 真并行改仓库。`--shared-workspace` 可回退到共享目录模式。

### Changed

- OpenCode 集成 dashboard：支持 OpenCode 会话列表（`--opencode-feed`）。

## [0.1.16] — 2026-05-08

### Added

- Dashboard 支持 alternate screen 模式，改善小终端显示体验。

## [0.1.14] — 2026-05-08

### Added

- Dashboard 视口自适应：根据终端高度动态调整任务列表显示数量（`viewport-plan.ts`）。

## [0.1.13] — 2026-05-08

### Changed

- Dashboard 命令描述优化，明确 IDE 集成终端行为。
- 任务 `rowSig` 指纹增强，新增字段去重。

## [0.1.12] — 2026-05-08

### Added

- `queue batch-cancel`：批量取消指定状态的任务（如 `--from-status queued,running`）。
- 动态 worker 配置：从文件读取 worker 参数。

## [0.1.11] — 2026-05-08

### Added

- 批量处理与 OpenCode 集成增强。
- 任务管理与 dashboard 功能扩展。

## [0.1.10] — 2026-05-06

### Added

- `postinstall` 脚本：自动为 `better-sqlite3` 执行 rebuild，解决原生模块安装问题。

## [0.1.9] — 2026-05-06

### Added

- Dashboard 命令增强，支持 `--ink` / `--json` 输出选项。

## [0.1.6] — 2026-05-06

### Added

- **Dashboard 命令**（`dashboard` / `ui`）：基于 Ink + React 的全屏终端看板，分区展示执行管线与历史归档。
- **Insights**：状态分布、失败热点、耗时摘要，支持 snapshot 与导出。
- 任务合并功能，增强并发处理。
- `IsoClock`：统一时间管理。

## [0.1.4] — 2026-05-06

### Added

- **AI / 语义验收**：`--ai-review-command-template` 在确定性 verify 后跑独立验收命令，失败自动重试并注入 `[ai-review-fix]`。
- Review gate：Plan → Execute 派生，review-approve / review-reject 控制流。

## [0.1.3] — 2026-04-30

### Added

- **SQLite 存储后端**：替代 JSONL 作为默认队列持久化方案（`--storage sqlite`）。
- 任务验证流增强：execute → verify → (ai-review) → done 管线固化。

## [0.1.2] — 2026-04-30

### Added

- **多环境初始化**：`project init` 支持 `--environments cursor`（可选 claude、codex），为不同 IDE 生成配套指令文件。
- 发布稳定性：剥离 npm 代理设置，添加命令超时防止卡死。
- 发布自动化脚本：`npm run release` 一键发布。

## [0.1.1] — 2026-04-30

### Added

- TypeScript CLI 框架搭建：Commander + 分层 ports-adapters 架构。
- `project init`：一键初始化项目，自动探测执行器（`opencode → codex → claude`）。
- `skill install`：为 Cursor 安装 agent-farm-dispatch Skill。
- 调度脚本 `agent-farm-dispatch.sh` 生成。

[Unreleased]: https://github.com/BK201-Drama/agent-farm-cli/compare/v0.1.27...HEAD
[0.1.27]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.27
[0.1.26]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.26
[0.1.25]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.25
[0.1.24]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.24
[0.1.22]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.22
[0.1.21]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.21
[0.1.20]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.20
[0.1.19]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.19
[0.1.18]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.18
[0.1.16]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.16
[0.1.14]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.14
[0.1.13]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.13
[0.1.12]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.12
[0.1.11]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.11
[0.1.10]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.10
[0.1.9]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.9
[0.1.6]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.6
[0.1.4]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.4
[0.1.3]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.3
[0.1.2]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.2
[0.1.1]: https://github.com/BK201-Drama/agent-farm-cli/releases/tag/v0.1.1
