# 源码分层（便于改对目录）

- **`src/domain/`**：`task` / `event` 限界上下文 + **`domain/ports/`**（仓储、时钟、Shell 等**领域**端口）
- **`src/application/contracts/`**：应用层契约（如 worker 收窄依赖、项目初始化网关），**不要**与 `domain/ports/` 混称「端口」
- **`src/application/use-cases/task/`**：任务队列用例；**`use-cases/project/`**：`init-project` 与 `dev-environment` / `executor-presets`
- **`src/application/facades/`**：对外门面；**`worker/`**：单任务执行与模板展开；**`worker/process-claimed-task/`** 为单任务管线目录（**`index.ts`** 编排；**`context.ts`** / **`events.ts`** / **`worktree.ts`**；**`stage-execute.ts`** / **`stage-verify.ts`** / **`stage-ai-review.ts`**）；旁路通用模块如 **`opencode-retry-diag.ts`**、**`command-template.ts`**、**`ai-review-template.ts`**、**`run-opencode-aware-shell.ts`** 等仍放在 **`worker/`** 根下
- **`src/infrastructure/`**：持久化、时钟、Shell、模板、**`project/node-project-init-gateway`** 等实现
- **`src/interfaces/cli/`**：命令行（含 **`tui/task-dashboard/`**：`agent-farm dashboard` / `ui`；**`helpers/`** 按关注点分文件并由 **`helpers/index.ts`** 汇总导出；**`hooks/dashboard-nav/`** 看板键盘状态与 **`handle-dashboard-input.ts`** 纯按键分发）；**`register/queue/`** 按子命令拆文件；**`src/bootstrap/`**：装配 `createContainer`

→ 调度与 wave：[dispatch-and-environment.md](./dispatch-and-environment.md)、[wave-authoring.md](./wave-authoring.md)
