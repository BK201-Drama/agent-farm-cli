# 仓库协作说明

本仓库默认 **Cursor** 里拆任务与调度，**OpenCode** 作为 worker 执行器（见 `scripts/agent-farm-dispatch.sh`、`npm run farm:init` 使用的 `--executor opencode`）。

- Cursor：`.cursor/skills/agent-farm-dispatch/SKILL.md`
- 派活入口：`./scripts/agent-farm-dispatch.sh "任务描述"` 或 `npm run farm:dispatch -- "任务描述"`
- **Wave → OpenCode（仅此）**：在 **`.agent-farm/waves/`** 写入 wave JSON → **`./scripts/agent-farm-dispatch-batch.sh <该文件>`** 或 **`npm run farm:wave -- .agent-farm/waves/xxx.json`**（无 Bash 时用 **`npm run farm:dispatch:batch:node --`** 同上）。`agent-farm project init` 会创建空目录 `.agent-farm/waves/`；包内不带任何 wave 文本。
- OpenCode：本仓库 `npm install` 即带 `opencode-ai`；调度脚本用 `npx --prefix="$AGENT_FARM_WORKSPACE_ROOT"` + `--dir "$AGENT_FARM_WORKSPACE"` 调用。模型密钥放在 **`.agent-farm/profile.env`**（参考 `scripts/agent-farm-profile.env.example`），与 Cursor 使用同一厂商时填**同一把** `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` 等即可。
- 队列存储：**SQLite**（`dispatch` 脚本会 `export AGENT_FARM_STORAGE=sqlite`，数据库默认在 `.agent-farm/queue/agent_farm.db`）

## 源码分层（便于改对目录）

- **`src/domain/`**：`task` / `event` 限界上下文 + **`domain/ports/`**（仓储、时钟、Shell 等**领域**端口）
- **`src/application/contracts/`**：应用层契约（如 worker 收窄依赖、项目初始化网关），**不要**与 `domain/ports/` 混称「端口」
- **`src/application/use-cases/task/`**：任务队列用例；**`use-cases/project/`**：`init-project` 与 `dev-environment` / `executor-presets`
- **`src/application/facades/`**：对外门面；**`worker/`**：单任务执行与模板展开；**`worker/process-claimed-task/`** 为单任务管线目录（**`index.ts`** 编排；**`context.ts`** / **`events.ts`** / **`worktree.ts`**；**`stage-execute.ts`** / **`stage-verify.ts`** / **`stage-ai-review.ts`**）；旁路通用模块如 **`opencode-retry-diag.ts`**、**`command-template.ts`**、**`ai-review-template.ts`**、**`run-opencode-aware-shell.ts`** 等仍放在 **`worker/`** 根下
- **`src/infrastructure/`**：持久化、时钟、Shell、模板、**`project/node-project-init-gateway`** 等实现
- **`src/interfaces/cli/`**：命令行（含 **`tui/task-dashboard/`**：`agent-farm dashboard` / `ui`；**`helpers/`** 按关注点分文件并由 **`helpers/index.ts`** 汇总导出；**`hooks/dashboard-nav/`** 看板键盘状态与 **`handle-dashboard-input.ts`** 纯按键分发）；**`register/queue/`** 按子命令拆文件；**`src/bootstrap/`**：装配 `createContainer`

## `--brief` UX 约定

`agent-farm doctor` 与 `agent-farm insights` 支持 `--brief` 选项：

- **默认**：输出完整 JSON 到 stdout（向后兼容）
- **`--brief`**：向 stderr 输出多行人类可读摘要（任务总数、状态计数、top 失败原因截断、doctor 的 sqlite 探针结论），不输出 JSON
- 不影响 `--output-file` 选项的行为
