# 仓库协作说明

本仓库默认 **Cursor** 里拆任务与调度，**OpenCode** 作为 worker 执行器（见 `scripts/agent-farm-dispatch.sh`、`npm run farm:init` 使用的 `--executor opencode`）。

- Cursor：`.cursor/skills/agent-farm-dispatch/SKILL.md`
- 派活入口：`./scripts/agent-farm-dispatch.sh "任务描述"` 或 `npm run farm:dispatch -- "任务描述"`
- **Wave → OpenCode（仅此）**：在 **`.agent-farm/waves/`** 写入 wave JSON（根为数组；每项为完整任务对象，经 `queue add --task-json` 入队，可含 `mode`、`priority`、`acceptance_criteria` 等，至少 `task_id` / `dedupe_key` / `prompt`）→ **`./scripts/agent-farm-dispatch-batch.sh <该文件>`** 或 **`npm run farm:wave -- …`**（无 Bash 时用 **`npm run farm:dispatch:batch:node --`**）。字段与 `queue add --task-json` 一致；wave 最小示例见 **`README.md`**「Wave 文件最小示例」。`project init` 会创建空目录 `.agent-farm/waves/`。
- OpenCode：本仓库 `npm install` 即带 `opencode-ai`；调度脚本用 `npx --prefix="$AGENT_FARM_WORKSPACE_ROOT" opencode-ai run --pure --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions` 调用。模型密钥放在 **`.agent-farm/profile.env`**（参考 `scripts/agent-farm-profile.env.example`），与 Cursor 使用同一厂商时填**同一把** `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` 等即可。
- 队列存储：**SQLite**（`dispatch` 脚本会 `export AGENT_FARM_STORAGE=sqlite`，数据库默认在 `.agent-farm/queue/agent_farm.db`）

## 源码分层（便于改对目录）

- **`src/domain/`**：`task` / `event` 限界上下文 + **`domain/ports/`**（仓储、时钟、Shell 等**领域**端口）
- **`src/application/contracts/`**：应用层契约（如 worker 收窄依赖、项目初始化网关），**不要**与 `domain/ports/` 混称「端口」
- **`src/application/use-cases/task/`**：任务队列用例；**`use-cases/project/`**：`init-project` 与 `dev-environment` / `executor-presets`
- **`src/application/facades/`**：对外门面；**`worker/`**：单任务执行与模板展开；**`worker/process-claimed-task/`** 为单任务管线目录（**`index.ts`** 编排；**`context.ts`** / **`events.ts`** / **`worktree.ts`**；**`stage-execute.ts`** / **`stage-verify.ts`** / **`stage-ai-review.ts`**）；旁路通用模块如 **`opencode-retry-diag.ts`**、**`command-template.ts`**、**`ai-review-template.ts`**、**`run-opencode-aware-shell.ts`** 等仍放在 **`worker/`** 根下
- **`src/infrastructure/`**：持久化、时钟、Shell、模板、**`project/node-project-init-gateway`** 等实现
- **`src/interfaces/cli/`**：命令行（含 **`tui/task-dashboard/`**：`agent-farm dashboard` / `ui`；**`helpers/`** 按关注点分文件并由 **`helpers/index.ts`** 汇总导出；**`hooks/dashboard-nav/`** 看板键盘状态与 **`handle-dashboard-input.ts`** 纯按键分发）；**`register/queue/`** 按子命令拆文件；**`src/bootstrap/`**：装配 `createContainer`

## 自迭代 wave 写作规范

### `dedupe_key` 命名

- **与 `task_id` 一致**：绝大多数场景下 `dedupe_key` 等于 `task_id`，形成 1:1 防重。
- **格式**：`<区域或迭代>-<日期>-<简述>`，全部 **kebab-case**（小写连字符），如 `meta-self-iter-20260510-agents-wave-authoring`、`polish-20260510b-doctor-brief-storage`。
- **稳定性**：同一意图的任务使用相同的 `dedupe_key`，防止同一项被重复入队。重复时 worker 会标记 `blocked`（原因：`task_deduped_blocked`）。
- **不能为空**：入队脚本 (`enqueue-task-wave.mjs`) 会拒绝 `dedupe_key` 为空或缺失的任务。

### 验收命令写进 `prompt`

- **prompt 末尾必须写验收命令**，格式：`验收：\`npm run check && npm test\` 必须通过`，让 worker 在执行前就明确验收标准。
- **`acceptance_criteria` 字段** 作为补充（可选），在 verify/ai-review 阶段展开为模板占位符 `{acceptance_criteria}`，供 AI 或验收脚本使用。
- **prompt 开头标注仓库根**，如 `仓库根：agent-farm-cli。`，帮助 worker 定位项目上下文。
- **verify 必跑**：每条任务模板须挂 verify 命令（默认模板已内置），禁止跳过确定性验收。

### 禁止直接改 DB

- **`.agent-farm/queue/agent_farm.db` 是内部实现细节**，Schema、WAL 模式、`busy_timeout` 由 agent-farm 自行管理。
- **worker / OpenCode 任务不得直接读写该 SQLite 数据库**（包括 `sqlite3` 命令行、SQL 直连等一切方式）。
- **操作队列的唯一入口**：
  - 入队：`agent-farm queue add --task-json` 或 `./scripts/agent-farm-dispatch-batch.sh`
  - 查询：`agent-farm queue list` / `agent-farm doctor` / `agent-farm dashboard`
  - 状态变更：worker 内部通过 `TaskRepository` 领域端口操作，外部用 `agent-farm queue update`
- 违反此规则可能导致 WAL 锁冲突、脏读，或破坏队列一致性。

### 建议 task 粒度

- **小 wave**：每次发 **1~3 条**任务，跑通再追加。大量任务堆积时排查困难。
- **单任务聚焦一个目标**：避免「既改 A 又重构 B」的混合任务。一个 task 对应一个可验证的变更。
- **plan 与 execute 分离**：
  - `mode: "plan"`：分析、设计、输出方案，**不写代码**。`priority` 建议 0~1。
  - `mode: "execute"`：实现、修复、重构，写代码并**通过验收**。`priority` 建议 2~3。
  - plan 先于 execute：先让 plan 任务跑出设计结论，再按其输出落 execute。
- **priority 排序**：3 = 紧急, 2 = 重要, 1 = 低优, 0 = 后台。
- **先 pull 再 wave**：发波前 `git pull` 确保 HEAD 最新，减少 worktree 从旧 commit 分岔产生的合并冲突。

### 验收

- 单个 task 验收：prompt 内写验收命令，worker 执行后 verify 阶段自动校验。
- 整波验收：所有任务 `done` 后，运行 `agent-farm doctor` 确认无重复 `dedupe_key`、无积压异常。
- 出现 `task_merge_failed` 时按 README 自动合并排错步骤处理：脏区冲突先 `git stash pop`，真冲突 `git merge --abort` 后手动合入，再 `queue update` 标记 done。

## `--brief` UX 约定

`agent-farm doctor` 与 `agent-farm insights` 支持 `--brief` 选项：

- **默认**：输出完整 JSON 到 stdout（向后兼容）
- **`--brief`**：向 stderr 输出多行人类可读摘要（任务总数、状态计数、top 失败原因截断、doctor 的 sqlite 探针结论），不输出 JSON
- 不影响 `--output-file` 选项的行为
