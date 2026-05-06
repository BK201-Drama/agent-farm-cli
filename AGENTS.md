# 仓库协作说明

本仓库默认 **Cursor** 里拆任务与调度，**OpenCode** 作为 worker 执行器（见 `scripts/agent-farm-dispatch.sh`、`npm run farm:init` 使用的 `--executor opencode`）。

- Cursor：`.cursor/skills/agent-farm-dispatch/SKILL.md`
- 派活入口：`./scripts/agent-farm-dispatch.sh "任务描述"` 或 `npm run farm:dispatch -- "任务描述"`
- 批量优化波（预置任务 JSON + 多 worker）：`npm run farm:enqueue:optimization` 入队；`npm run farm:optimization-wave` 入队并跑 worker；或 `./scripts/agent-farm-dispatch-batch.sh enqueue|worker|all [wave.json]`
- OpenCode：本仓库 `npm install` 即带 `opencode-ai`；调度脚本用 `npx` + `AGENT_FARM_WORKSPACE` 调用。模型密钥放在 **`.agent-farm/profile.env`**（参考 `scripts/agent-farm-profile.env.example`），与 Cursor 使用同一厂商时填**同一把** `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` 等即可。
- 队列存储：**SQLite**（`dispatch` 脚本会 `export AGENT_FARM_STORAGE=sqlite`，数据库默认在 `.agent-farm/queue/agent_farm.db`）

## 源码分层（便于改对目录）

- **`src/domain/`**：`task` / `event` 限界上下文 + **`domain/ports/`**（仓储、时钟、Shell 等**领域**端口）
- **`src/application/contracts/`**：应用层契约（如 worker 收窄依赖、项目初始化网关），**不要**与 `domain/ports/` 混称「端口」
- **`src/application/use-cases/task/`**：任务队列用例；**`use-cases/project/`**：`init-project` 与 `dev-environment` / `executor-presets`
- **`src/application/facades/`**：对外门面；**`worker/`**：单任务执行与模板展开
- **`src/infrastructure/`**：持久化、时钟、Shell、模板、**`project/node-project-init-gateway`** 等实现
- **`src/interfaces/cli/`**：命令行（含 **`tui/task-dashboard.tsx`**：`agent-farm dashboard` / `ui`）；**`src/bootstrap/`**：装配 `createContainer`
