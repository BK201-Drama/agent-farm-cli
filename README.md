# agent-farm-cli

`agent-farm-cli` 是一个可全局安装的 TypeScript CLI，用于给任意 agent 系统接入：

- 队列驱动并行执行
- Plan/Review 工作流
- 自动重试、租约恢复、poison 隔离
- 运行可观测（insights）与健康巡检（doctor）

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

## 快速开始（3 分钟）

```bash
# 1) 入队两条任务
agent-farm queue add --task-json '{"task_id":"t1","prompt":"实现登录接口","mode":"execute","dedupe_key":"auth-login"}'
agent-farm queue add --task-json '{"task_id":"t2","prompt":"补充登录测试","mode":"execute","dedupe_key":"auth-test"}'

# 2) 启动 worker（示例命令模板，实际替换为你的 agent 执行命令）
agent-farm worker --workers 2 --command-template 'echo {prompt}' --auto-approve-review

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

- `queue add`：添加任务（支持 `dedupe_key` 防重）
- `queue list`：查看当前任务
- `queue claim`：手动 claim 任务
- `queue update`：更新任务状态
- `queue review-approve`：review 通过；Plan 可派生 Execute
- `queue review-reject`：review 驳回；可回流 retry
- `queue recover-stale`：租约超时回收 `running -> retry`
- `queue quarantine-poison`：超重试阈值任务隔离为 `blocked`

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

- `src/interfaces/cli/`：命令行入口（只做参数解析与调用）
- `src/application/services/`：应用服务（queue/worker/insights/doctor）
- `src/domain/`：领域模型（Task/Event、状态定义）
- `src/ports/`：端口接口（仓储抽象）
- `src/infrastructure/persistence/jsonl/`：JSONL 适配器实现
- `src/bootstrap/`：依赖装配（container）

推荐目录树：

```text
src/
  interfaces/
    cli/
      index.ts
  application/
    services/
      queue-service.ts
      worker-service.ts
      insights-service.ts
      doctor-service.ts
  domain/
    task.ts
    event.ts
  ports/
    repositories.ts
  infrastructure/
    persistence/
      jsonl/
        jsonl-utils.ts
        task-repository.ts
        event-repository.ts
        quarantine-repository.ts
  bootstrap/
    container.ts
```

## 替换存储（最小改动路径）

如果你后续切换到 SQLite/Postgres，不需要改 `queue/worker/insights/doctor` 业务代码，只需：

1. 实现 `src/ports/repositories.ts` 的三个接口：
   - `TaskRepository`
   - `EventRepository`
   - `QuarantineRepository`
2. 在 `src/bootstrap/container.ts` 把 JSONL 适配器替换为你的新适配器。
3. CLI 命令层 `src/index.ts` 无需改业务调用方式。

## License

MIT
