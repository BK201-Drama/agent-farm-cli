# ADR-002：Cursor Agent SDK 作为 Executor（M2 Spike）

**状态**：已接受（M2 spike 已合入代码）  
**依赖**：ADR-001

## 目标

一条 `mode=execute` 任务在 **Cursor SDK / Cloud Agent** 上 end-to-end：

`claim → execute（SDK）→ verify → review`

## 最小 Spike 范围

| 项   | 说明                                                                     |
| ---- | ------------------------------------------------------------------------ |
| 包   | 可选依赖 `@cursor/sdk`（或文档列出的当前包名），不进入默认 install       |
| 注册 | `AGENT_FARM_EXECUTOR=cursor-sdk` 或 `project init --executor cursor-sdk` |
| 输入 | `prompt`、`workspaceDir`、任务 `read_paths`                              |
| 输出 | 写 `execute-{n}.json`（`node-stage-report` schema）                      |
| 失败 | 映射为 `retry` / `failed`，与 shell executor 一致                        |

## 与控制面关系

- 派活仍走 **队列 + worker**；Cursor 侧栏/MCP 只操作队列，不替代 SDK runtime。
- 可选：SDK agent 只跑 execute，plan 仍在 Cursor 对话 + wave 入队。

## 验收（M2）

- 示例脚本或 BDD：`examples/embed-minimal` + 文档步骤
- 一条官方 wave 在 CI 外手工录屏 5 分钟内跑通

## 风险

- SDK API 变更 → executor 适配层 semver 独立
- 密钥与配额 → 文档说明，不入库
