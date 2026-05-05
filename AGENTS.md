# 仓库协作说明

本仓库默认 **Cursor** 里拆任务与调度，**OpenCode** 作为 worker 执行器（见 `scripts/agent-farm-dispatch.sh`、`npm run farm:init` 使用的 `--executor opencode`）。

- Cursor：`.cursor/skills/agent-farm-dispatch/SKILL.md`
- 派活入口：`./scripts/agent-farm-dispatch.sh "任务描述"` 或 `npm run farm:dispatch -- "任务描述"`
- 需已安装并在 PATH 中可用：`opencode`
- 队列存储：**SQLite**（`dispatch` 脚本会 `export AGENT_FARM_STORAGE=sqlite`，数据库默认在 `.agent-farm/queue/agent_farm.db`）
