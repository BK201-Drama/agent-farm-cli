# 安装、快速开始与命令总览

> 从根目录 README 迁入；与 [英文版](../en/install-quickstart-commands.md) 对应。

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
- **冷启动**：实现上仅在执行 `dashboard` / `ui` 时对 Ink 看板做动态 `import()`；常用子命令如 `queue`、`doctor`、`worker` 不会因此预加载 TUI 依赖（贡献者说明见 **`docs/agents/source-layout.md`**）。

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

→ [用户指南索引](../README.md) · 下一章：[dogfood-wave-opencode.md](./dogfood-wave-opencode.md)
