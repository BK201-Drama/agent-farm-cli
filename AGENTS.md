<!-- 勿将 /execute、/verify、/ai-review 的长输出接到 head/tail/wc 等截断管道，否则子进程可能被 SIGPIPE。 -->

# 仓库协作说明

本仓库默认 **Cursor** 拆任务与调度，**OpenCode** 作 worker；队列为 **SQLite**（`dispatch` 会设 `AGENT_FARM_STORAGE=sqlite`，库在 `.agent-farm/queue/agent_farm.db`）。

**渐进式披露**：下面只保留「立刻要用的」；wave 规范、目录结构、DB 禁令、CLI 摘要行为等拆到 **`docs/agents/`**（从 **[`docs/agents/README.md`](docs/agents/README.md)** 按表选读）。完整命令与示例见 **`README.md`**；任务 JSON / CLI 契约见 **`docs/harness-contracts.md`**。

## 一上来就要知道的

- **Skill**：`.cursor/skills/agent-farm-dispatch/SKILL.md`
- **单条派活**：`./scripts/agent-farm-dispatch.sh "任务描述"` 或 `npm run farm:dispatch -- "任务描述"`（无 Bash：`npm run farm:dispatch:node --`）
- **Wave**：在 `.agent-farm/waves/` 写 JSON 数组 → `./scripts/agent-farm-dispatch-batch.sh <文件>` 或 `npm run farm:wave -- …`；官方样例 **`examples/waves/team-handoff-min.json`**（`project init` 会写入 `.agent-farm/waves/team-handoff-min.example.json`）
- **个人→团队→CI**：`npm run ci:health:local`、`npm run farm:doctor:ci`；行为回归 **`npm run test:bdd`**、**`npm run validate:waves`**（约定见 **`test/bdd/README.md`**；第二轮 **`docs/roadmap-phase2-personal-team-ci.md`**）
- **模型密钥**：`.agent-farm/profile.env`（模板 `scripts/agent-farm-profile.env.example`）
- **队列**：只通过 `agent-farm queue …` / `doctor` / `dashboard` 操作；**不要**用 `sqlite3` 等直连 `.agent-farm/queue/agent_farm.db`
- **长时间 worker**：建议在系统终端跑
- **控制面 / MCP**：`npm run farm:control-plane` 启动 HTTP 面板；`npm run farm:mcp` 作为 Cursor MCP 工具；详见 [`docs/integrations/cursor-control-plane.md`](docs/integrations/cursor-control-plane.md)
- **往下读**：[`docs/agents/README.md`](docs/agents/README.md)
