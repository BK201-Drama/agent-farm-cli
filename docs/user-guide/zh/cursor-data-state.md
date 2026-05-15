# Cursor、数据目录与状态机

> 从根目录 README 迁入；与 [英文版](../en/cursor-data-state.md) 对应。

## Cursor 对接建议（免反复提示）

如果你希望在 Cursor 对话里不显式写“请用并行模式”，建议：

1. 用 `project init` 安装 skill 与 dispatch 脚本
2. 在项目 `AGENTS.md` 或规则文件中写入：
   - 可并行任务默认走 `agent-farm`
   - 小任务保留串行直改
3. 日常调度由脚本承接，Agent 主要负责拆任务与 review

更细的协作叙事见 **[`../../agents/README.md`](../../agents/README.md)**。

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

→ [用户指南索引](../README.md) · 上一章：[dogfood-wave-opencode.md](./dogfood-wave-opencode.md) · 下一章：[agent-integration.md](./agent-integration.md)
