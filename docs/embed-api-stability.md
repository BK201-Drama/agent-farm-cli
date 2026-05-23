# 嵌入 API 稳定性（`agent-farm-cli/core`）

M3 起对外暴露 **`agent-farm-cli/core`**（见 `src/application/public-api.ts`），供 Node 脚本与二次封装使用。

## 导入方式

```ts
import { ControlPlaneService, createContainer } from "agent-farm-cli/core";
```

```js
import { ControlPlaneService } from "agent-farm-cli/core";
```

## Semver 约定（1.0 候选前）

| 变更类型 | 示例                                        | 版本      |
| -------- | ------------------------------------------- | --------- |
| 破坏性   | 删除 export、改 `ControlPlaneView` 必填字段 | **major** |
| 新增     | 新 export、可选 JSON 字段                   | **minor** |
| 修复     | 行为与文档一致的 bugfix                     | **patch** |

`0.x`（当前）仍可能为小版本追加 export；集成方建议 **锁 minor** 或锁 `package-lock`。

## 稳定 export 清单（M3）

- `ControlPlaneService` / `createControlPlaneService`
- `createContainer`、`StoragePaths`
- `buildStuckReport`、`formatStuckBrief`
- `resolveQueueWorkspace`
- `validateWaveItem` / `validateWaveArray` / `validateTaskJsonBeforeEnqueue`
- `resolveExecuteExecutor`、`createCursorSdkExecutor`
- 类型：`TaskExecutorPort`、`AgentFarmProjectConfig` 等

未列入清单的 `src/` 内部模块**不保证**稳定。

## 示例

- [examples/embed-minimal/](../examples/embed-minimal/)

## 非目标

- 不保证 CLI `argv` 形状稳定（请用库 API 或 MCP/HTTP）
- 不提供远程托管队列
