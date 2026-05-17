# M4 多模型路由设计

> 父文档：[`roadmap-m4-plus-intelligence.md`](../roadmap-m4-plus-intelligence.md)

## 目标

让 agent-farm 支持**任务级模型选择**，用户可在 wave JSON、config.json、环境变量三级指定模型，worker 执行时按优先级解析并传递给 executor。

---

## 1. Wave 新增 `model` 字段

### Schema 扩展（`schemas/wave-task-item.schema.json`）

```json
{
  "model": {
    "type": "string",
    "description": "任务级模型选择，优先级高于 config 和环境变量。为空时走默认解析。"
  }
}
```

`additionalProperties: true` 已开启，新增字段向后兼容，旧 wave 不受影响。

### 使用示例

```json
[
  {
    "task_id": "refactor-rename-vars",
    "dedupe_key": "refactor-rename-vars",
    "mode": "execute",
    "model": "gpt-4o-mini",
    "prompt": "将所有变量重命名为 camelCase。验收：npm run check"
  },
  {
    "task_id": "arch-redesign-auth",
    "dedupe_key": "arch-redesign-auth",
    "mode": "plan",
    "model": "claude-opus",
    "prompt": "设计新的认证架构方案。验收：输出完整设计文档"
  }
]
```

---

## 2. 三级优先级解析

### 优先级（从高到低）

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1（最高） | `task.model` | Wave 任务字段 |
| 2 | `config.json` → `executor.model` | 项目级默认模型 |
| 3 | `AGENT_FARM_MODEL` 环境变量 | 会话级覆盖 |
| 4（最低） | `undefined` | 不指定，由 executor 自行决定 |

### Resolver 接口

```typescript
// src/application/executors/resolve-model.ts

/**
 * 按优先级解析最终使用的模型标识符。
 * @returns 模型名（如 "claude-opus"、"gpt-4o-mini"），或 undefined 表示不指定
 */
export function resolveModel(
  taskModel?: string | null,
  configModel?: string | null,
  envModel?: string | null,
): string | undefined;
```

简化版（从现有类型直接取值）：

```typescript
export function resolveModelFromContext(
  task: JsonMap,
  projectConfig?: AgentFarmProjectConfig | null,
): string | undefined {
  return resolveModel(
    String(task.model ?? "").trim() || undefined,
    projectConfig?.executor?.model?.trim() || undefined,
    process.env.AGENT_FARM_MODEL?.trim() || undefined,
  );
}
```

---

## 3. 配置文件扩展

### `.agent-farm/config.json` 新增字段

```json
{
  "executor": {
    "id": "cursor-sdk",
    "model": "composer-2"
  }
}
```

`AgentFarmProjectConfig` 类型变更：

```typescript
// src/application/contracts/agent-farm-project-config.ts

export type AgentFarmProjectConfig = {
  empty_run?: AgentFarmEmptyRunConfig;
  // 兼容旧格式（string），同时支持新格式（object）
  executor?: string | {
    id?: string;
    model?: string;
  };
};
```

向后兼容：若 `executor` 为 string，等同于 `{ id: string }`。

---

## 4. 各 Executor 如何接 model 参数

### 4.1 Shell Template Executor

命令模板新增 `{model}` 占位符：

```bash
# 默认模板
opencode run --prompt {prompt} --task-id {task_id} --out {runs_dir}{model:+ --model {model}}
```

若 model 解析结果为空，`{model}` 替换为空字符串。

### 4.2 Cursor SDK Executor

```typescript
// src/infrastructure/executors/cursor-sdk-executor.ts

export function createCursorSdkExecutor(modelOverride?: string): TaskExecutorPort {
  return {
    id: CURSOR_SDK_EXECUTOR_ID,
    async run(input: TaskExecutorRunInput): Promise<TaskExecutorRunResult> {
      // ...existing apiKey check...

      // 任务级 model 优先，否则回退 env
      const modelId = modelOverride
        || process.env.AGENT_FARM_CURSOR_MODEL?.trim()
        || "composer-2";

      return runWithCursorSdk(Agent, input, apiKey, modelId);
    },
  };
}
```

### 4.3 OpenCode Path

```typescript
// 在 run-opencode-aware-shell.ts 中追加参数
if (model) {
  cmd += ` --model ${model}`;
}
```

---

## 5. 数据流（端到端）

```
Wave JSON (task.model: "gpt-4o-mini")
    │
    ▼
queue add → 任务入队（model 字段持久化到 SQLite/jsonl）
    │
    ▼
worker claim → 读取 task.model
    │
    ▼
resolveModelFromContext(task, config)
    │  优先级：task.model > config.executor.model > AGENT_FARM_MODEL
    ▼
resolveExecuteExecutor(task, ..., config)
    │  传入 resolvedModel
    ▼
executor.run(input)
    │  cursor-sdk: { model: { id: resolvedModel } }
    │  shell-template: {model} 占位符替换
    ▼
stage-execute → 记录 model 到执行报告
```

---

## 6. Dashboard / Insights 可见性

- **ControlPlaneView.board[].model**：展示每任务的模型
- **Insights** 新增 `buildModelUsageBreakdown()`：
  ```typescript
  { model: string; task_count: number; success_rate: number; avg_duration_ms: number }
  ```
- **Dashboard** 管线表新增 `model` 列

---

## 7. 验收要点

1. Wave JSON 写 `"model": "gpt-4o-mini"` → `validate:waves` 通过
2. `config.json` 设 `executor.model` → worker 默认使用该模型
3. `AGENT_FARM_MODEL=claude-opus` 环境变量覆盖 config
4. `task.model` 覆盖以上两者
5. Dashboard / MCP 工具返回 model 字段
6. `npm run check && npm test` 全绿
