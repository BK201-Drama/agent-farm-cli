# 源码分层（便于改对目录）

- **`src/domain/`**：`task` / `event` 限界上下文 + **`domain/ports/`**（仓储、时钟、Shell 等**领域**端口）
- **`src/application/contracts/`**：应用层契约（如 worker 收窄依赖、项目初始化网关），**不要**与 `domain/ports/` 混称「端口」
- **`src/application/use-cases/task/`**：任务队列用例；**`use-cases/project/`**：`init-project` 与 `dev-environment` / `executor-presets`
- **`src/application/facades/`**：对外门面；**`worker/`**：单任务执行与模板展开；**`worker/process-claimed-task/`** 为单任务管线目录（**`index.ts`** 编排；**`context.ts`** / **`events.ts`** / **`worktree.ts`**；**`stage-execute.ts`** / **`stage-verify.ts`** / **`stage-ai-review.ts`**）；旁路通用模块如 **`opencode-retry-diag.ts`**、**`command-template.ts`**、**`ai-review-template.ts`**、**`run-opencode-aware-shell.ts`** 等仍放在 **`worker/`** 根下
- **`src/infrastructure/`**：持久化、时钟、Shell、模板、**`project/node-project-init-gateway`** 等实现
- **`src/interfaces/cli/`**：命令行适配器；子命令在 **`register/`** 分文件注册。**`dashboard` / `ui`**：`register/dashboard.ts` 在命令 **`action`** 内 **`import()`** 加载 **`tui/task-dashboard/`**（Ink + React），使 `queue`、`doctor`、`worker` 等路径冷启动不经过 TUI 依赖图。同层辅助含 **`default-queue-container.ts`**、**`brief-stderr.ts`**（`doctor` / `insights` / `status` 的 `--brief` 共用格式化）、**`print.ts`**（`print` 与 **`writePrettyJsonReportIfPath`**）、**`defaults.ts`** 等。**`register/project.ts`** 在 **`project init`** 的 **`action`** 内动态加载 **`register/project-init-action.ts`**，避免冷路径拉取初始化用例与模板依赖。**`skill install`** 对 **`skill-md`** 懒加载。**`register/doctor.ts`** 对 **`doctor-action.ts`** 懒加载。其余含 **`helpers/`**（`helpers/index.ts` 汇总）、**`hooks/dashboard-nav/`**；**`register/queue/`** 按子命令拆分；**`worktree-cleanup.ts`** 对 **`worktree-cleanup-action.ts`** 懒加载。
- **`src/bootstrap/`**：**`container.ts`** 装配仓储与门面；**`default-storage-container.ts`** 封装「当前 cwd + `resolveQueueWorkspace` → `createContainer`」。**`interfaces/cli/default-queue-container.ts`** 的 **`createCliQueueContainer`** 再叠一层 CLI 默认路径（task/event/quarantine），供 `register/*` 与 **`register/queue/`** 复用，避免各子命令重复导入三份默认常量。

→ 调度与 wave：[dispatch-and-environment.md](./dispatch-and-environment.md)、[wave-authoring.md](./wave-authoring.md)
