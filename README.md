# agent-farm-cli

`agent-farm-cli` 是一个可全局安装的 TypeScript CLI，用于给任意 agent 系统接入：

- 队列驱动并行执行
- Plan/Review 工作流
- 自动重试、租约恢复、poison 隔离
- 运行可观测（insights）与健康巡检（doctor）
- 可选 **AI/语义验收**：每条任务在 execute（及确定性 verify）后运行独立验收命令，失败自动重试并注入 `[ai-review-fix]`

## 设计目标

- **可移植**：只依赖 Node.js，可在任何仓库中使用
- **可并行**：多 worker 并发消费队列任务
- **可恢复**：`running` 卡住自动回收，失败任务超阈值自动隔离
- **可治理**：状态机、review gate、重复任务幂等防重

## 安装

### 方式 A：直接从 GitHub 全局安装

```bash
npm i -g github:BK201-Drama/agent-farm-cli
```

### 方式 B：本地开发安装

```bash
npm install
npm run build
npm link
```

安装后命令为：

```bash
agent-farm --help
```

## 在本仓库内迭代（dogfood）

本仓库已执行 `project init`（**SQLite** 存储：`npm run farm:init` 使用 `--storage sqlite`），并生成：

- `.agent-farm/config.json`、`.agent-farm/queue/agent_farm.db` 与队列元数据路径（**已在 `.gitignore`，勿提交运行数据**）
- `scripts/agent-farm-dispatch.sh`：优先使用 **`dist` 里的本地 CLI**，未 build 时会提示先 `npm run build`
- `.cursor/skills/agent-farm-dispatch/SKILL.md`：Cursor 侧调度说明
- **执行器：OpenCode**（npm 包名 `opencode-ai`，本仓库已列入 `devDependencies`；调度脚本用 `npx --prefix="$AGENT_FARM_WORKSPACE_ROOT" opencode-ai run --pure --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions` 调用，不依赖全局 PATH。模型密钥见下节「OpenCode 与 API Token」。）

常用命令：

```bash
npm run build
npm run farm:dispatch -- "你的任务描述"
npm run farm:insights
npm run farm:doctor
npm run farm:dashboard
```

**Windows**：单条派活请用 `npm run farm:dispatch:node -- "任务描述"`。**Wave → OpenCode** 只有两步：在 **`.agent-farm/waves/`** 自建 wave JSON（根为**数组**，每项与 **`queue add --task-json`** 形态一致，至少含 `task_id`、`dedupe_key`、`prompt`；可选 `mode`、`priority`、`acceptance_criteria` 等）→ `npm run farm:wave -- .agent-farm/waves/xxx.json`（无 Bash 时同 `node scripts/agent-farm-dispatch-batch.mjs <文件>`）。包内**不附带**示例 wave 文件（避免发布物携带业务模板）；最小形态见下。

#### Wave 文件最小示例（`.agent-farm/waves/*.json`）

```json
[
  {
    "task_id": "task-a",
    "dedupe_key": "task-a",
    "mode": "execute",
    "prompt": "实现功能并通过 npm test"
  },
  {
    "task_id": "task-b",
    "dedupe_key": "task-b",
    "mode": "plan",
    "prompt": "仅输出计划，不改代码"
  }
]
```

### OpenCode 与 API Token

- **CLI**：npm 包名为 [`opencode-ai`](https://www.npmjs.com/package/opencode-ai)（本仓库 `devDependencies` 已声明）。调度脚本通过 `npx --prefix="$AGENT_FARM_WORKSPACE_ROOT" opencode-ai run --pure --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions {prompt}` 调用，**不要求**全局 `opencode` 在 Git Bash 的 PATH 里。
- **与 Cursor 同一密钥**：复制 `scripts/agent-farm-profile.env.example` 为 `.agent-farm/profile.env`，填入与 Cursor 模型设置中**同一厂商、同一密钥**的环境变量（例如 Anthropic：`ANTHROPIC_API_KEY`）。`agent-farm-dispatch*.sh` 在启动 worker 前会 `source` 该文件；worker 子进程继承 `process.env`，与 OpenCode 官方环境变量一致。
- **多 worker 并行 OpenCode（P0 默认）**：`npm run farm:dispatch:node`、`scripts/agent-farm-dispatch-batch.sh` / **`agent-farm-dispatch-batch.mjs`** 在跑 OpenCode 模板时已带 **`--isolate-opencode-db`**。`project init` 生成的 `agent-farm-dispatch.sh` 在检测到模板含 **`opencode-ai`** 时也会追加该参数。若手写 `worker`，请自行加上 **`--isolate-opencode-db`** 或设置 **`AGENT_FARM_ISOLATE_OPENCODE_DB=1`**；独立库路径为 `<workspace>/.agent-farm/opencode-db/<task_id>.db`（`task_id` 会清洗为安全文件名）。

终端看板 `dashboard`（别名 `ui`）使用 **Ink + React** 分区展示「执行管线」与「历史归档」，带轮询刷新与 Braille 动画，便于肉眼确认 worker 是否在推进。可选 `--refresh-ms`（默认 900）。首次拉依赖后需 `npm install`。请在**项目仓库根**执行（与 worker 的 `--workspace` 一致），否则 sqlite 队列路径不对会显示**无任务**。`--opencode-feed`（如 `npm run farm:dashboard:opencode`）会列出 **`session.directory` 在仓库根或其子目录下**的 OpenCode 会话（含 **`.agent-farm/worktrees/...`** 下的并行任务）。

不全局安装时，可直接：`npm run agent-farm -- queue list`（需先 `npm run build`）。开发 CLI 本身可用 `npm run agent-farm:dev -- --help`。

重新生成 init 产物（覆盖 skill / 脚本等）：`npm run farm:init`。

## 快速开始（3 分钟）

```bash
# 1) 入队两条任务（可用 --prompt 避免 shell 转义 JSON）
agent-farm queue add --prompt "实现登录接口" --task-id t1 --dedupe-key auth-login
agent-farm queue add --task-json '{"task_id":"t2","prompt":"补充登录测试","mode":"execute","dedupe_key":"auth-test"}'

# 2) 启动 worker（示例命令模板，实际替换为你的 agent 执行命令；默认验收通过后自动 done）
agent-farm worker --workers 2 --command-template 'echo {prompt}'

# 3) 查看运行质量
agent-farm insights
agent-farm doctor
```

## 一键接入项目（推荐）

首次接入请直接执行：

```bash
agent-farm project init --target-dir .
```

该命令会自动完成：

- 初始化 `.agent-farm/queue/` 数据目录
- 安装 Cursor Skill 到 `.cursor/skills/agent-farm-dispatch/SKILL.md`
- 生成可执行调度脚本 `scripts/agent-farm-dispatch.sh`

初始化后推荐直接用脚本派活：

```bash
./scripts/agent-farm-dispatch.sh "实现注册接口并补测试"
```

## 命令总览

### Queue

- `queue add`：添加任务（`--task-json` 或 `--prompt`；支持 `dedupe_key` 防重）
- `queue list`：查看当前任务（例如 `agent-farm queue list --status queued`）
- `queue claim`：手动 claim 任务
- `queue update`：更新任务状态
- `queue review-approve`：review 通过；Plan 可派生 Execute
- `queue review-reject`：review 驳回；可回流 retry
- `queue recover-stale`：租约超时回收 `running -> retry`
- `queue quarantine-poison`：超重试阈值任务隔离为 `blocked`
- `queue batch-cancel`：批量取消（例如 `agent-farm queue batch-cancel --from-status queued,running`）

### Dashboard（终端 UI）

- `dashboard`（`ui`）：全屏刷新看板——上区 **正在执行/管线中**（`running`、`claimed` 等带动态 spinner），下区 **历史任务**（`done`、`failed`、`blocked` 等）；`q` / `ESC` 退出
- 选项：`--task-file`、`--refresh-ms`（最小 200）

### Worker

- `worker`：并发消费任务
  - 支持自动租约恢复
  - 支持自动 poison 隔离
  - 支持可选 `review -> approved -> done` 自动放行

### Observability

- `insights`：状态分布、失败热点、耗时摘要
- `doctor`：健康巡检（卡住任务、重复 dedupe、review 超时、失败热点）

### Skill Integration

- `skill install`：一键把 Agent Farm Skill 安装到项目
  - 示例：`agent-farm skill install --target-dir .`
  - 输出：`<project>/.cursor/skills/agent-farm-dispatch/SKILL.md`
  - 可用 `--force` 覆盖

### Project Bootstrap（推荐）

- `project init`：一键初始化项目接入（推荐首选）
  - 创建 `.agent-farm/queue/` 目录与数据文件
  - 安装 Skill 到 `.cursor/skills/<skill-name>/SKILL.md`
  - 生成可执行调度脚本 `scripts/agent-farm-dispatch.sh`
  - 默认自动探测执行器：`opencode -> codex -> claude`
  - 支持执行器预设：`auto / opencode / codex / claude`
  - 支持自定义执行器命令模板（完全解耦）
  - 示例：
    - `agent-farm project init --target-dir .`
    - `agent-farm project init --target-dir . --workers 10 --force`
    - `agent-farm project init --target-dir . --executor auto`
    - `agent-farm project init --target-dir . --executor codex`
    - `agent-farm project init --target-dir . --executor-command 'my-runner --input {prompt}'`

## Cursor 对接建议（免反复提示）

如果你希望在 Cursor 对话里不显式写“请用并行模式”，建议：

1. 用 `project init` 安装 skill 与 dispatch 脚本
2. 在项目 `AGENTS.md` 或规则文件中写入：
   - 可并行任务默认走 `agent-farm`
   - 小任务保留串行直改
3. 日常调度由脚本承接，Agent 主要负责拆任务与 review

## 默认数据目录

CLI 默认在当前目录下维护运行数据：

- `.agent-farm/queue/tasks.jsonl`
- `.agent-farm/queue/events.jsonl`
- `.agent-farm/queue/quarantine_tasks.jsonl`

你可以通过各命令参数覆盖这些路径。

## 状态机约定

主路径：

`queued/retry -> claimed -> running -> review -> approved -> done`

异常路径：

- 失败重试：`running -> retry`
- poison 隔离：`retry/failed -> blocked`
- worker 崩溃恢复：`running -> retry`（lease timeout）

## 与你自己的 Agent 集成

核心在 `--command-template`：

```bash
agent-farm worker \
  --workers 3 \
  --command-template 'your-agent-cli run --task-id {task_id} --prompt {prompt} --out {runs_dir}' \
  --lease-timeout-seconds 1800 \
  --poison-max-attempts 3
```

占位符：

- `{task_id}`
- `{prompt}`
- `{runs_dir}`
- `{workspace}`（任务执行目录：**默认**每条任务为独立 git worktree 检出；`--shared-workspace` 时与 `--workspace` 相同）
- `{acceptance_criteria}`（来自任务字段 `acceptance_criteria`，JSON 转义后嵌入命令）

环境变量（子进程均可读）：`AGENT_FARM_TASK_ID`、`AGENT_FARM_RUNS_DIR`、`AGENT_FARM_WORKSPACE`（执行器 `--dir` / 改代码目录）、`AGENT_FARM_WORKSPACE_ROOT`（仓库根，含 `node_modules/.bin`，给 `npx --prefix` 用）、`AGENT_FARM_PROMPT`；启用 worktree 时另有 `AGENT_FARM_WORKTREE_BRANCH`（`agent-farm/<task-id>`）。

#### Git worktree 真并行（多任务同时改仓库）

**默认开启**：`agent-farm worker` 会为每条任务在 **`<repo>/.agent-farm/worktrees/<task-id>`** 单独检出，并创建分支 **`agent-farm/<task-id>`**（起点为当前 `HEAD` 的干净树；不含主工作区未提交改动）。任务结束后目录会删掉，**分支保留**，便于在主仓库 `git merge` 或检视。这样 **`--workers` > 1** 时各任务不会抢同一工作区文件。

- 要求：`--workspace` 在 **git 仓库**内，且本机可用 `git`。
- **关闭 worktree**（共用同一检出目录）：传 **`--shared-workspace`**，或派活脚本里设 **`AGENT_FARM_GIT_WORKTREE=0`** / **`false`**。
- OpenCode 模板须区分前缀与工作目录，例如：  
  `npx --prefix="$AGENT_FARM_WORKSPACE_ROOT" opencode-ai run --pure --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions {prompt}`（本仓库自带 dispatch 脚本已按此写法）。
- worktree 内默认**无**主目录的 `node_modules`（若未提交），需在命令模板里对 worktree 执行 `npm ci` / `pnpm install` 等，或仅用 `WORKSPACE_ROOT` 调 `npx`。
- **任务结束后 `.agent-farm/worktrees/<id>` 会消失**是正常现象：worker 会 `git worktree remove` 释放目录，**提交仍在本地分支 `agent-farm/<id>`**；用 `git branch` 查看。
- **拆除 worktree 前默认做 snapshot commit**：先 `git add -A`（常规未 ignore 变更），再**默认**对存在时的 **`.agent-farm/runs`** 执行 **`git add -f`**，避免产出只写在 ignore 的 runs 里却进不了提交；关闭：**`AGENT_FARM_WORKTREE_SNAPSHOT_SKIP_RUNS=1`**。其它仍被 ignore 的路径用 **`AGENT_FARM_WORKTREE_SNAPSHOT_FORCE_ADD`**（逗号/分号/竖线分隔，相对 worktree 根，逐个 `git add -f`）；若仅有 ignore 内文件且既未命中 runs 也未配置 FORCE_ADD，会**提交失败并保留 worktree**，stderr/事件里带提示。提交默认 **`--no-verify`**；若要让 hook 运行则设 **`AGENT_FARM_GIT_COMMIT_VERIFY=1`**。作者默认 **`agent-farm` / `agent-farm@local`**，可用 **`AGENT_FARM_GIT_COMMITTER_NAME`**、**`AGENT_FARM_GIT_COMMITTER_EMAIL`** 覆盖。成功会写 **`task_worktree_snapshot_committed`**；失败则**不删除 worktree**，并写 **`task_worktree_snapshot_failed`**。整体关闭 snapshot：**`AGENT_FARM_WORKTREE_SNAPSHOT=0`**。
- **自动合并进当前分支**：在 snapshot 之后执行。`agent-farm worker --auto-merge`（或 `AGENT_FARM_AUTO_MERGE=1`）。任务在 **自动 approve 并标记 done** 后，会在仓库根把对应 `agent-farm/<id>` **串行** `git merge --no-ff` 进**此时主工作区已检出的分支**。若 Git 因**未提交改动**拒绝合并，默认会先 **`git stash push -u`**，合并成功后再 **`git stash pop`** 尽量恢复现场；`pop` 若冲突会记 **`task_merge_failed`** 并需你手动解决。关闭该行为（恢复为「脏树直接 merge 失败」）：**`AGENT_FARM_AUTO_MERGE_STASH=0`**。其它合并失败（真冲突等）仍写 **`task_merge_failed`**。Wave 脚本默认开启合并，可用 **`AGENT_FARM_AUTO_MERGE=0`** 关闭。使用 **`--no-auto-approve-review`** 时不会走 done 自动合并路径，需自行合并。
- **自动合并排错**：出现 `task_merge_failed` 时，先 `agent-farm doctor` 快速定位失败任务与原因；`agent-farm queue list --status failed` 可查看所有失败任务。若由 stash pop 冲突（脏工作区未提交改动与合入内容冲突）导致，`git stash list` 查看未恢复的 stash，手动 `git stash pop` 解决冲突后 `git reset HEAD` 清理暂存，最后用 `agent-farm queue update <id> --status done` 手动标记。其他真合并冲突可 `git merge --abort` 后手动 cherry-pick 或 merge 再标记。
- **合并冲突 / task_merge_failed 恢复步骤**：① `git status` 确认当前分支与冲突状态；② 解决冲突后 `git add -A && git merge --continue`，或放弃合并：`git merge --abort`（若有未恢复 stash 先 `git stash pop` 解决）；③ 若队列任务卡在 `running`：`agent-farm queue recover-stale --lease-timeout-seconds 1800`；④ 重新启动 worker（wave 脚本或直接 `agent-farm worker ...`）。关闭自动合并避免干扰：`AGENT_FARM_AUTO_MERGE=0`。

#### OpenCode NDJSON 可观测与自愈（`run --format json`）

- 开启：**`agent-farm worker --opencode-json-events`**，或在 `.agent-farm/profile.env` 中设置 **`AGENT_FARM_OPENCODE_JSON_EVENTS=1`**。
- worker 会在常见模板里为 **`opencode-ai run`** 自动插入 **`--format json`**（若尚未指定），并对 **stdout/stderr 按行** 尝试解析 JSON；**execute / verify / ai-review** 三阶段里，只要展开后的命令包含 **`opencode-ai run`** 即启用同一套观察器。阶段失败时写入 **`task_opencode_stream_diag`**（带 **`stage`**：`execute` | `verify` | `ai_review`），并在 **`retry`** 时更新 **`prompt`**：**execute/verify** 追加 **`[opencode-heal]`**；**ai-review** 在 **`[ai-review-fix]`** 之后视情况再追加 **`[opencode-heal]`**（并与上一轮附加互斥去重）。
- 事件 schema 随 `opencode-ai` 版本可能变化，解析为**宽松模式**。
- **`agent-farm doctor`**：JSON 中带 **`opencode_cli`**（本机 `opencode-ai run --help` 是否像支持 `--format json`）、队列中 **`tasks_with_opencode_heal_prompt`**、以及近期 **`task_opencode_stream_diag`** 计数与按 **`stage`** 聚合（需可访问 event 存储；sqlite/jsonl 均已接好）。

### AI / 语义验收（每条 task）

适合 diff 量大、人看不完的场景：在 **确定性 verify**（测试/lint）之后，再跑一道 **验收命令**（通常内部再调 LLM 或专用脚本）。`exit 0` 才进入 `review`。

```bash
agent-farm worker \
  --workers 2 \
  --workspace . \
  --command-template 'your-agent {prompt}' \
  --verify-command-template 'npm test' \
  --ai-review-command-template 'bash scripts/ai-review.example.sh' \
  --require-ai-review
```

- **`--ai-review-command-template`**：全局默认验收命令；可用任务字段 **`ai_review_command_template`** 按任务覆盖。
- **`--require-ai-review`**：除 **`skip_ai_review: true`** 的任务外，必须有模板，否则任务 **`blocked`**（防止漏验收）。
- **失败重试**：验收非 0 时进入 `retry`，并在 `prompt` 末尾追加 **`[ai-review-fix]`** + 验收输出，便于执行 agent 针对性修改。

仓库内 stub：`scripts/ai-review.example.sh`（复制到项目中再改成真实验收逻辑）。

### 执行器解耦（重要）

调度层并不绑定某个模型工具。你可以在 `project init` 时选择：

- `--executor auto`（默认，自动探测）
- `--executor opencode`
- `--executor codex`
- `--executor claude`

也可以完全自定义：

```bash
agent-farm project init \
  --target-dir . \
  --executor-command 'your-runner --task {task_id} --prompt {prompt}'
```

只要你的命令模板支持 `{prompt}`（可选 `{task_id}`/`{runs_dir}`），就能接入。

默认 `auto` 行为：

1. `project init` 时会先探测本机可用执行器（优先级：`opencode -> codex -> claude`）。
2. 生成的 `scripts/agent-farm-dispatch.sh` 运行时也会再次探测，避免环境变化导致失效。

推荐先安装 Skill，让 Cursor Agent 默认知道何时走并行调度：

```bash
agent-farm skill install --target-dir .
```

更推荐直接使用一键初始化：

```bash
agent-farm project init --target-dir .
```

然后用脚本调度：

```bash
./scripts/agent-farm-dispatch.sh "你的任务描述"
```

## 常见问题

- **Q: 为什么任务不执行？**
  - 先看 `agent-farm doctor`，检查是否卡在 `review` 或被隔离。
- **Q: 为什么同类任务加不进去？**
  - 命中了 `dedupe_key` 防重，换 key 或先处理已有任务。
- **Q: 如何覆盖重装 skill/脚本？**
  - `agent-farm project init --target-dir . --force`
- **Q: 如何确认接入完成？**
  - 检查三个路径：
    - `.agent-farm/queue/`
    - `.cursor/skills/agent-farm-dispatch/SKILL.md`
    - `scripts/agent-farm-dispatch.sh`

## 发布到 npm

当前仓库已支持 npm 包结构（`bin: agent-farm`）。发布步骤：

```bash
npm adduser
npm run build
npm publish --access public
```

如果包名冲突，建议改为 scope 名称（例如 `@bk201/agent-farm-cli`）。

## 目录架构（SOLID + Ports/Adapters）

- `src/domain/ports/`：领域出站端口（仓储、时钟、Shell 等接口）
- `src/domain/task/`：任务限界上下文——`model`（类型与状态常量）、`transitions`（状态机）、`enqueue`（入队/去重）、`board`（claim/租约回收/毒任务拆分）；根目录 `task.ts`/`event.ts` 为聚合导出
- `src/application/use-cases/task/`：任务队列相关用例（与 `domain/task/` 词汇对齐）；`use-cases/project/`：项目初始化用例及配套预设/环境枚举
- `src/application/facades/`：应用门面（`QueueService` 等）；`facades/worker.ts` 为 worker 循环入口
- `src/application/contracts/`：应用层契约（非领域端口），如 `ClaimedTaskCommands`、`ProjectInitGateway`——由门面或基础设施实现，避免与 `domain/ports/` 混淆
- `src/interfaces/cli/`：命令行适配器；子命令注册在 `cli/register/`
- `src/domain/`：领域模型与策略（`task.ts`/`event.ts` 聚合、`domain/task/*`、`domain/event/*`、`domain/ports/`）
- `src/infrastructure/persistence/jsonl/`、`sqlite/`：仓储适配器实现（JSONL / SQLite）
- `src/bootstrap/`：依赖装配（container）

推荐目录树：

```text
src/
  interfaces/
    cli/
      index.ts
      tui/
        task-dashboard/
          app.tsx
          index.tsx
          helpers/
          hooks/
            dashboard-nav/
      register/
        index.ts
        dashboard.ts
        queue/
          index.ts
          …
  application/
    contracts/
      claimed-task-commands.ts
      project-init-gateway.ts
    use-cases/
      task/
        add-task.ts
        claim-tasks.ts
      project/
        init-project.ts
        dev-environment.ts
        executor-presets.ts
    facades/
      queue.ts
      worker.ts
      insights.ts
      doctor.ts
    worker/
      process-claimed-task/
        index.ts
        context.ts
        events.ts
        worktree.ts
        stage-execute.ts
        stage-verify.ts
        stage-ai-review.ts
      opencode-retry-diag.ts
      …
  domain/
    task.ts
    event.ts
    task/
      model.ts
      transitions.ts
      enqueue.ts
      board.ts
    event/
      model.ts
    ports/
      repositories.ts
  infrastructure/
    clock/
      iso-clock.ts
    project/
      node-project-init-gateway.ts
    persistence/
      jsonl/
        jsonl-utils.ts
        tasks.ts
        events.ts
        quarantine.ts
      sqlite/
        db.ts
        tasks.ts
        events.ts
        quarantine.ts
  bootstrap/
    container.ts
```

## 替换存储（最小改动路径）

如果你后续切换到 SQLite/Postgres，不需要改 `queue/worker/insights/doctor` 业务代码，只需：

1. 实现 `src/domain/ports/repositories.ts` 的三个接口：
   - `TaskRepository`
   - `EventRepository`
   - `QuarantineRepository`
2. 在 `src/bootstrap/container.ts` 把 JSONL 适配器替换为你的新适配器。
3. CLI 适配层仅调用应用服务/用例，业务调用方式保持稳定。

## 变更日志

详见 [CHANGELOG.md](./CHANGELOG.md)。

## License

MIT
