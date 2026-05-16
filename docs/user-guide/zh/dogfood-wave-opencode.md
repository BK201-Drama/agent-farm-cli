# 本仓库 dogfood、Wave 与 OpenCode

> 从根目录 README 迁入；与 [英文版](../en/dogfood-wave-opencode.md) 对应。

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

**Windows**：单条派活请用 `npm run farm:dispatch:node -- "任务描述"`。**Wave → OpenCode** 只有两步：在 **`.agent-farm/waves/`** 自建 wave JSON（根为**数组**，每项与 **`queue add --task-json`** 形态一致，至少含 `task_id`、`dedupe_key`、`prompt`；可选 `mode`、`priority`、`acceptance_criteria` 等）→ `npm run farm:wave -- .agent-farm/waves/xxx.json`（无 Bash 时同 `node scripts/agent-farm-dispatch-batch.mjs <文件>`）。仓库内可复制示例见 **[`examples/waves/team-handoff-min.json`](../../../examples/waves/team-handoff-min.json)**（团队异步交接最小两条：plan + execute）；更短模板见下。

### Wave 文件最小示例（`.agent-farm/waves/*.json`）

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

### 入队与消费分离

- **入队**：`npm run farm:wave` / `npm run farm:dispatch:node`（或 `agent-farm queue add`）把任务写入队列。
- **消费**：`agent-farm worker` 仅从队列取任务执行，不重复入队。
- **防重**：同一 `dedupe_key` 不会重复入队。

### 自迭代 playbook

- **小 wave**：每次发 1~3 条任务，跑通再追加，避免大量失败堆积排查困难。
- **勿用截断管道**：勿将 `/execute`、`/verify`、`/ai-review` 的长输出管道到 `head`、`tail`、`wc` 等截断工具，否则子进程可能被 SIGPIPE 提前终止。
- **先 pull 再 wave**：启动前 `git pull` 确保 HEAD 最新，减少 worktree 从旧 commit 分岔产生的合并冲突。
- **verify 必跑**：每条任务模板须挂 verify（如 `npm test && npm run build`），禁止跳过确定性验收。
- **冲突排错**：出现 `task_merge_failed` 时按上方「自动合并排错」步骤处理：脏区冲突先 `git stash pop`，真冲突 `git merge --abort` 后手动合入，再 `queue update` 标记 done。
- **Cursor 与 worker 分工**：Cursor 负责拆任务、写 wave JSON、触发 dispatch；本仓库 `agent-farm worker` 仅消费队列执行，不再入队。wave 通过 `.agent-farm/waves/` + `farm:wave` 批量入队后自动启动 worker。

### 一键恢复（中断后继续）

`./scripts/agent-farm-init-and-dispatch-batch.sh <wave.json>` 先执行 `npm run farm:init` 重建项目环境，再批量入队并启动 worker。适合中断后快速恢复，无需手动 init。

### OpenCode 与 API Token

- **CLI**：npm 包名为 [`opencode-ai`](https://www.npmjs.com/package/opencode-ai)（本仓库 `devDependencies` 已声明）。调度脚本通过 `npx --prefix="$AGENT_FARM_WORKSPACE_ROOT" opencode-ai run --pure --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions {prompt}` 调用，**不要求**全局 `opencode` 在 Git Bash 的 PATH 里。
- **与 Cursor 同一密钥**：复制 `scripts/agent-farm-profile.env.example` 为 `.agent-farm/profile.env`，填入与 Cursor 模型设置中**同一厂商、同一密钥**的环境变量（例如 Anthropic：`ANTHROPIC_API_KEY`）。`agent-farm-dispatch*.sh` 在启动 worker 前会 `source` 该文件；worker 子进程继承 `process.env`，与 OpenCode 官方环境变量一致。
- **多 worker 并行 OpenCode（P0 默认）**：`npm run farm:dispatch:node`、`scripts/agent-farm-dispatch-batch.sh` / **`agent-farm-dispatch-batch.mjs`** 在跑 OpenCode 模板时已带 **`--isolate-opencode-db`**。`project init` 生成的 `agent-farm-dispatch.sh` 在检测到模板含 **`opencode-ai`** 时也会追加该参数。若手写 `worker`，请自行加上 **`--isolate-opencode-db`** 或设置 **`AGENT_FARM_ISOLATE_OPENCODE_DB=1`**；独立库路径为 `<workspace>/.agent-farm/opencode-db/<task_id>.db`（`task_id` 会清洗为安全文件名）。

终端看板 `dashboard`（别名 `ui`）使用 **Ink + React** 分区展示「执行管线」与「历史归档」，带轮询刷新与 Braille 动画，便于肉眼确认 worker 是否在推进。可选 `--refresh-ms`（默认 900）。首次拉依赖后需 `npm install`。请在**项目仓库根**执行（与 worker 的 `--workspace` 一致），否则 sqlite 队列路径不对会显示**无任务**。`--opencode-feed`（如 `npm run farm:dashboard:opencode`）会列出 **`session.directory` 在仓库根或其子目录下**的 OpenCode 会话（含 **`.agent-farm/worktrees/...`** 下的并行任务）。

不全局安装时，可直接：`npm run agent-farm -- queue list`（需先 `npm run build`）。开发 CLI 本身可用 `npm run agent-farm:dev -- --help`。

重新生成 init 产物（覆盖 skill / 脚本等）：`npm run farm:init`。

→ [用户指南索引](../README.md) · 上一章：[install-quickstart-commands.md](./install-quickstart-commands.md) · 下一章：[cursor-data-state.md](./cursor-data-state.md)
