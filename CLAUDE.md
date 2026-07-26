# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Agent Farm 调度

当任务属于”可并行编码执行”时，优先用 `agent-farm` 调度，而不是串行执行。

### 快速入口

```bash
# 单条任务
./scripts/agent-farm-dispatch.sh “实现登录接口并补测试”

# Windows（无 Bash 时）
npm run farm:dispatch:node -- “实现登录接口并补测试”
```

### Wave 批量任务

1. 在 `.agent-farm/waves/` 写 JSON 数组，每条至少含 `task_id`、`dedupe_key`、`prompt`
2. 启动：`npm run farm:wave -- .agent-farm/waves/你的文件.json`

### 健康检查

```bash
agent-farm doctor --ci-exit
agent-farm insights
```

### 队列管理

```bash
agent-farm queue list          # 查看队列
agent-farm stuck list --brief  # 卡住的任务
agent-farm dashboard           # TUI 看板
```

**注意**：不要用 sqlite3 等工具直连 `.agent-farm/queue/agent_farm.db`——始终通过 `agent-farm queue ...` 操作。

## 环境变量参考

### 存储

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_FARM_STORAGE` | `sqlite` | 队列存储后端：`sqlite`（推荐）或 `jsonl`（仅调试） |
| `AGENT_FARM_SELF_HEALING_MAX_RETRIES` | `3` | 自愈最大重试次数（超过后进入 poison 降级） |
| `AGENT_FARM_SELF_HEALING_DEGRADATION_MODEL` | — | poison 降级时的备选模型（如 `gpt-4o`）；逗号分隔多个备选 |
| `AGENT_FARM_SELF_HEALING_TIMEOUT_MINUTES` | `30` | 单次自愈尝试最长等待时间 |

### Worker 执行

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_FARM_SHELL_TIMEOUT_MS` | — | execute/verify/ai-review 子进程超时（毫秒），最小值 3000 |
| `AGENT_FARM_MODEL` | — | 全局默认模型（task > config > env 三级解析） |
| `AGENT_FARM_EXECUTOR` | — | 执行器选择：`shell-template`（默认）或 `cursor-sdk` |
| `AGENT_FARM_EMPTY_RUN` | `1` | 开启空转检测（无 git diff + 无 agent 输出 → abort） |
| `AGENT_FARM_EMPTY_RUN_GRACE_MINUTES` | `11` | 空转宽限期（分钟），超时后才触发 early warning |
| `AGENT_FARM_EMPTY_RUN_MIN_AGENT_LINES` | `20` | 空转判断：agent 输出最少行数 |
| `AGENT_FARM_EMPTY_RUN_MIN_TOOL_CALLS` | `3` | 空转判断：最少 tool call 次数 |
| `AGENT_FARM_OPENCODE_JSON_EVENTS` | — | 设为 `1` 解析 OpenCode NDJSON 流，失败时注入自愈提示 |
| `AGENT_FARM_OPENCODE_CLI_TIMEOUT_MS` | — | 单次 opencode-ai 子进程超时（≥3000，≤600000） |
| `AGENT_FARM_CLAUDE_JSON_EVENTS` | — | 设为 `1` 解析 Claude Code stream-json NDJSON 流 |
| `AGENT_FARM_RATE_LIMIT_CONCURRENCY_REDUCTION` | — | rate-limit 检测后建议降低的并发数 |

### Git Worktree

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_FARM_GIT_WORKTREE` | `1` | 设为 `0`/`false` 关闭 worktree 并行，使用共享工作区 |
| `AGENT_FARM_WORKTREE_SNAPSHOT` | `1` | 设为 `0`/`false` 关闭 worktree 快照提交 |
| `AGENT_FARM_WORKTREE_SNAPSHOT_SKIP_RUNS` | — | 设为 `1` 快照时跳过 `.agent-farm/runs` |
| `AGENT_FARM_WORKTREE_SNAPSHOT_FORCE_ADD` | — | 额外强制 add 的路径（逗号/分号分隔，相对 worktree 根） |
| `AGENT_FARM_GIT_COMMITTER_NAME` | `agent-farm` | 快照提交的 committer name |
| `AGENT_FARM_GIT_COMMITTER_EMAIL` | `agent-farm@local` | 快照提交的 committer email |
| `AGENT_FARM_GIT_COMMIT_VERIFY` | — | 设为 `1` 在快照提交时运行 gpg 签名验证 |

### 自动合并

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_FARM_AUTO_MERGE` | `1` | 设为 `0`/`false` 关闭自动合并 |
| `AGENT_FARM_AUTO_MERGE_STRATEGY` | `merge` | 合并策略：`rebase` 产生线性历史，其他值走 `git merge --no-ff` |
| `AGENT_FARM_AUTO_MERGE_STASH` | `1` | 设为 `0`/`false` 合并前不自动 stash 脏工作区 |

### DB 隔离

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_FARM_ISOLATE_OPENCODE_DB` | — | 设为 `1` 为每个任务创建独立 OpenCode DB，减少 WAL 争用 |
| `AGENT_FARM_ISOLATE_CLAUDE_DB` | — | 设为 `1` 为每个任务创建独立 Claude 配置目录 |

### SQLite

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_FARM_SKIP_SQLITE_REBUILD` | — | 设为 `1` 跳过 ABI 不匹配时的自动 rebuild |
| `AGENT_FARM_SKIP_SQLITE_RUNTIME_REBUILD` | — | 同上（别名） |

### Dashboard (TUI)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_FARM_DASHBOARD_OPENCODE` | — | 设为 `1` 在 TUI 底部显示 OpenCode 会话摘要 |
| `AGENT_FARM_DASHBOARD_OPENCODE_MAX_SESSIONS` | `3` | OpenCode export 最多会话数（1–20） |
| `AGENT_FARM_DASHBOARD_OPENCODE_ROWS_PER_SESSION` | `5` | 每个会话最多显示行数 |
| `AGENT_FARM_DASHBOARD_ALT_SCREEN` | `1` | 设为 `0`/`false` 禁用 Ink 全屏模式 |
| `AGENT_FARM_DASHBOARD_PLAIN` | — | 设为 `1` 纯文本模式（不使用 Ink 组件） |
| `AGENT_FARM_DASHBOARD_INK_FORCE_CLEAR` | — | 设为 `1` 强制在退出时清屏 |

### 控制平面 (HTTP)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_FARM_CONTROL_PLANE_HTML` | — | 自定义 HTML 模板文件路径，替换内联面板 HTML |

### 诊断探针

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_FARM_SKIP_EXECUTOR_PROBE` | — | 设为 `1` 跳过执行器健康检查 |
| `AGENT_FARM_SKIP_OPENCODE_PROBE` | — | 设为 `1` 跳过 OpenCode 运行探针（CI 推荐） |

### Wave 校验

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_FARM_PROMPT_LINT_STRICT` | — | 设为 `1` 严格模式：路径/空转提示升级为错误 |

### 任务类型路由 (M4+)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_FARM_TASK_TYPE_MODEL_DOC_GEN` | `gpt-4o-mini` | doc_gen 类型默认模型 |
| `AGENT_FARM_TASK_TYPE_MODEL_I18N` | `gpt-4o-mini` | i18n 类型默认模型 |
| `AGENT_FARM_TASK_TYPE_MODEL_CODE_GEN` | — | code_gen 类型默认模型 |
| `AGENT_FARM_TASK_TYPE_MODEL_TEST_GEN` | — | test_gen 类型默认模型 |
| `AGENT_FARM_TASK_TYPE_MODEL_CODE_REVIEW` | — | code_review 类型默认模型 |
| `AGENT_FARM_TASK_TYPE_MODEL_MIGRATION` | — | migration 类型默认模型 |
| `AGENT_FARM_TASK_TYPE_MODEL_REFACTOR` | — | refactor 类型默认模型 |

### Cursor SDK

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_FARM_CURSOR_MODEL` | `composer-2` | Cursor SDK 模型 ID |
| `AGENT_FARM_CURSOR_SDK_STREAM` | — | 设为 `1` 开启 Cursor SDK streaming |

### 自动更新 / NPM

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AGENT_FARM_AUTO_UPDATE` | — | `1` 或 `check`：其他子命令前自动检查更新 |
| `AGENT_FARM_NPM_REGISTRY` | `https://registry.npmjs.org/` | npm registry 地址 |

### 子进程环境（运行时注入，只读）

| 变量 | 说明 |
|------|------|
| `AGENT_FARM_TASK_ID` | 当前任务 ID |
| `AGENT_FARM_RUNS_DIR` | runs 目录路径 |
| `AGENT_FARM_WORKSPACE` | 任务工作区（worktree 模式下为检出目录） |
| `AGENT_FARM_WORKSPACE_ROOT` | 仓库根（含 node_modules，`npx --prefix` 用） |
| `AGENT_FARM_PROMPT` | 任务 prompt 文本 |
| `AGENT_FARM_WORKTREE_BRANCH` | worktree 分支名（worktree 模式） |
