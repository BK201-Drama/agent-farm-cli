# Cursor SDK Executor（ADR-002）

在 **execute** 阶段用 [`@cursor/sdk`](https://www.npmjs.com/package/@cursor/sdk) 跑任务，替代 shell 调 OpenCode/Codex。verify / ai-review 仍走 shell 模板。

## 何时使用

| 场景                                                  | 推荐                                         |
| ----------------------------------------------------- | -------------------------------------------- |
| 本机已配 `CURSOR_API_KEY`，希望执行与 Cursor 模型一致 | `cursor-sdk`                                 |
| 默认 OpenCode / 本地 CLI                              | `shell-template`（默认）或 `opencode` preset |

## 配置（优先级从高到低）

1. 任务字段 `"executor": "cursor-sdk"`
2. `.agent-farm/config.json` → `"executor": "cursor-sdk"`
3. 环境变量 `AGENT_FARM_EXECUTOR=cursor-sdk`

初始化：

```bash
agent-farm project init --executor cursor-sdk
# 写入 .agent-farm/config.json 的 executor 字段
```

## 依赖

```bash
npm i @cursor/sdk   # 可选 peer，未装时 worker 返回 exit 127 + 明确 stderr
export CURSOR_API_KEY=...   # 必填
# 可选
export AGENT_FARM_CURSOR_MODEL=composer-2
export AGENT_FARM_CURSOR_SDK_STREAM=1   # 使用 Agent.create + stream
```

## 跑一条任务

```bash
npm run build

# 1) 仅测 executor（不入队）
npm run farm:cursor-sdk:smoke

# 2) 入队 + worker
export AGENT_FARM_EXECUTOR=cursor-sdk
agent-farm queue add --task-json "$(cat examples/cursor-sdk-executor/task.json)"
agent-farm worker --workspace .
```

## 与 control-plane 关系

- 派活、看队列仍用侧栏 / MCP / `control-plane serve`。
- SDK 只在 **worker execute** 内调用；不把 API key 暴露给 Webview。

## 故障排查

| 现象                                | 处理                                                                |
| ----------------------------------- | ------------------------------------------------------------------- |
| `set CURSOR_API_KEY`                | 配置密钥或改回 `AGENT_FARM_EXECUTOR=shell-template`                 |
| `install optional peer @cursor/sdk` | 在仓库根 `npm i @cursor/sdk`                                        |
| execute 成功但 verify 失败          | 配置 `--verify-command-template` 或任务级 `verify_command_template` |

## 参考

- [ADR-001 可插拔 executor](../adr/001-pluggable-executor.md)
- [ADR-002](../adr/002-cursor-sdk-executor.md)
- 实现：`src/infrastructure/executors/cursor-sdk-executor.ts`
