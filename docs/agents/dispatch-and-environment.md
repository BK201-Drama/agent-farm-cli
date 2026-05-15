# 调度栈与环境

## Wave → OpenCode

在 **`.agent-farm/waves/`** 写入 wave JSON（根为数组；每项为完整任务对象，经 `queue add --task-json` 入队，可含 `mode`、`priority`、`acceptance_criteria` 等，至少 `task_id` / `dedupe_key` / `prompt`）→ **`./scripts/agent-farm-dispatch-batch.sh <该文件>`** 或 **`npm run farm:wave -- …`**（无 Bash 时用 **`npm run farm:dispatch:batch:node --`**）。字段与 `queue add --task-json` 一致；wave 最小示例见 **`README.md`**「Wave 文件最小示例」。`project init` 会创建空目录 `.agent-farm/waves/`。

## OpenCode

本仓库 `npm install` 即带 `opencode-ai`；调度脚本用 `npx --prefix="$AGENT_FARM_WORKSPACE_ROOT" opencode-ai run --pure --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions` 调用。与 Cursor 使用同一厂商时，密钥可填**同一把** `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` 等（见 `.agent-farm/profile.env`，模板 `scripts/agent-farm-profile.env.example`）。

## 存储

`dispatch` 脚本会 `export AGENT_FARM_STORAGE=sqlite`，数据库默认在 `.agent-farm/queue/agent_farm.db`。

## 相关入口

- Cursor Skill：`.cursor/skills/agent-farm-dispatch/SKILL.md`
- 单条派活：`./scripts/agent-farm-dispatch.sh "任务描述"` 或 `npm run farm:dispatch -- "任务描述"`

→ 下一层：[wave-authoring.md](./wave-authoring.md)（写任务）、[queue-database-rules.md](./queue-database-rules.md)（队列边界）
