# ADR-001：可插拔 Task Executor

**状态**：已接受（M1 草案，M2 实现）  
**日期**：2026-05

## 背景

agent-farm worker today 通过 `command-template` + `ShellRunner` 调用外部 CLI（OpenCode、Codex、Claude 等）。3 个月路线要求：

- OpenCode 路径保持不变（默认）
- **Cursor Agent SDK** 作为首个正式备选 executor（M2）
- 控制面在 Cursor，执行器可替换

## 决策

1. 引入 **`TaskExecutorPort`**（`src/domain/ports/task-executor.ts`）描述「在 workspace 内跑一条 prompt」。
2. 现有 **`ShellRunner` + command-template** 视为 **`ShellTemplateExecutor`** 适配器（M2 抽取），M1 不拆 worker 主路径。
3. Executor 由 **`project init --executor`** / env / 任务级 `execute_command_template` 选择；与队列、review、stuck 正交。
4. 不在 M1 引入 Cursor SDK 运行时依赖；仅 ADR + 接口 + M2 spike。

## 非目标（M1）

- 不重写 `process-claimed-task` 状态机
- 不发布 npm 包 `@agent-farm/executor-cursor`

## 后果

- M2 新增 `CursorSdkExecutor` 时，worker 组合根注册表：`opencode | shell | cursor-sdk`
- 节点报告（`execute-*.json`）由各 executor 写入，schema 见 `schemas/node-stage-report.schema.json`

## 参考

- `src/application/use-cases/project/executor-presets.ts`
- [ADR-002：Cursor SDK 执行器路径](./002-cursor-sdk-executor.md)
- [roadmap-big-vision-3m.md](../roadmap-big-vision-3m.md)
