# M4 任务类型路由器设计

> 父文档：[`roadmap-m4-plus-intelligence.md`](../roadmap-m4-plus-intelligence.md)

## 目标

让 agent-farm 按任务类型**自动选择 executor、model、验收策略和 prompt 模板**，减少用户手动配置成本，同时为不同类型任务提供合适的执行环境。

---

## 1. Wave 新增 `task_type` 字段

### Schema 扩展（`schemas/wave-task-item.schema.json`）

```json
{
  "task_type": {
    "type": "string",
    "enum": ["code_gen", "doc_gen", "test_gen", "code_review", "migration", "i18n", "refactor"],
    "description": "任务类型，用于自动选择 executor/model/prompt 模板。不指定时默认 code_gen。"
  }
}
```

### 七种类型定义

| task_type | 含义 | 典型 prompt 示例 |
|-----------|------|-----------------|
| `code_gen` | 生成/实现新功能 | "实现用户登录接口" |
| `doc_gen` | 生成文档/注释 | "为 UserService 生成 API 文档" |
| `test_gen` | 生成测试用例 | "为 auth 模块补单元测试，覆盖边界情况" |
| `code_review` | 代码审查 | "审查 PR #42 的代码质量" |
| `migration` | 框架/依赖迁移 | "将 express 路由迁移到 fastify" |
| `i18n` | 国际化 | "扫描项目中硬编码的中文字符串，提取 i18n key" |
| `refactor` | 重构（不改行为） | "将 UserService 拆分为更小的类，保持行为不变" |

---

## 2. 任务类型路由器

### 接口设计

```typescript
// src/application/executors/task-type-router.ts

export type TaskType = "code_gen" | "doc_gen" | "test_gen" | "code_review"
  | "migration" | "i18n" | "refactor";

export type TaskTypeRoute = {
  /** 推荐默认模型（可被 task.model 覆盖） */
  default_model?: string;
  /** 推荐默认 executor */
  default_executor?: string;
  /** 追加到 prompt 末尾的指令 */
  prompt_suffix?: string;
  /** verify 策略 */
  verify_strategy?: "lint_test" | "diff_only" | "readonly" | "none";
};

export type TaskTypeRouter = {
  route(taskType: TaskType, overrides?: Partial<TaskTypeRoute>): TaskTypeRoute;
  listTypes(): TaskType[];
};
```

### 默认路由表

```typescript
const DEFAULT_ROUTES: Record<TaskType, TaskTypeRoute> = {
  code_gen: {
    default_model: "composer-2",
    default_executor: "cursor-sdk",
    prompt_suffix: "\n\n实现后确保代码可编译运行。",
    verify_strategy: "lint_test",
  },
  doc_gen: {
    default_model: "gpt-4o-mini",
    default_executor: "shell-template",
    prompt_suffix: "\n\n输出格式为 Markdown，将文档置于 docs/ 目录下。不要修改任何源代码。",
    verify_strategy: "diff_only",
  },
  test_gen: {
    default_model: "composer-2",
    default_executor: "cursor-sdk",
    prompt_suffix: "\n\n覆盖边界情况、异常路径和空值处理。测试必须能通过。",
    verify_strategy: "lint_test",
  },
  code_review: {
    default_model: "composer-2",
    default_executor: "cursor-sdk",
    prompt_suffix: "\n\n只读模式：不要修改任何文件。输出审查意见为 Markdown 清单。",
    verify_strategy: "readonly",
  },
  migration: {
    default_model: "claude-opus",
    default_executor: "cursor-sdk",
    prompt_suffix: "\n\n分步迁移，每步保持代码可编译。迁移完成后确保所有测试通过。",
    verify_strategy: "lint_test",
  },
  i18n: {
    default_model: "gpt-4o-mini",
    default_executor: "shell-template",
    prompt_suffix: "\n\n提取所有硬编码中文字符串为 i18n key，不要改变任何业务逻辑。",
    verify_strategy: "lint_test",
  },
  refactor: {
    default_model: "claude-opus",
    default_executor: "cursor-sdk",
    prompt_suffix: "\n\n重构不改变任何外部行为。确保所有现有测试继续通过。",
    verify_strategy: "lint_test",
  },
};
```

---

## 3. 与 model resolver 的协同

```
task 入队
    │
    ├─ task.task_type = "doc_gen"
    │      │
    │      ▼
    │  TaskTypeRouter.route("doc_gen")
    │      → { default_model: "gpt-4o-mini", default_executor: "shell-template", ... }
    │      │
    │      ├─ 若 task.model 未指定 → 用 router 的 default_model
    │      ├─ 若 task.model 已指定 → 覆盖 router 的 default_model
    │      │
    │      ▼
    │  resolveModel(task.model, config.model, env) → 最终 model
    │      │
    │      ├─ 若 task.executor 未指定 → 用 router 的 default_executor
    │      ├─ 若 task.executor 已指定 → 覆盖 router 的 default_executor
    │      │
    │      ▼
    │  prompt += router.prompt_suffix
    │      │
    │      ▼
    │  executor.run(workspace_dir: ..., prompt: enrichedPrompt, model: finalModel)
```

---

## 4. 配置文件扩展

### `.agent-farm/config.json`

```json
{
  "task_types": {
    "doc_gen": {
      "default_model": "gpt-4o",
      "default_executor": "cursor-sdk",
      "verify_strategy": "lint_test"
    }
  }
}
```

用户可覆盖默认路由表中的任意项。

### 类型扩展

```typescript
// src/application/contracts/agent-farm-project-config.ts

export type AgentFarmProjectConfig = {
  empty_run?: AgentFarmEmptyRunConfig;
  executor?: string | { id?: string; model?: string };
  /** 用户自定义任务类型路由（覆盖默认路由表） */
  task_types?: Record<string, Partial<TaskTypeRoute>>;
};
```

---

## 5. 调用链路

```
resolveExecuteExecutor(task, cmdTemplate, shellDeps, config)
    │
    ├─ 1. 解析 task_type（task.task_type || "code_gen"）
    ├─ 2. TaskTypeRouter.route(taskType, configOverrides)
    │      → { default_model, default_executor, prompt_suffix, verify_strategy }
    ├─ 3. 合并 model：task.model || route.default_model
    ├─ 4. 合并 executor：task.executor || route.default_executor
    ├─ 5. 追加 prompt_suffix 到 prompt（若 prompt 不包含类似指令）
    └─ 6. 按 resolveExecutorId 创建并返回 executor
```

### Modify point in `resolve-execute-executor.ts`

```typescript
export function resolveExecuteExecutor(
  task: JsonMap,
  commandTemplate: string,
  shellDeps: /* ... */,
  projectConfig?: AgentFarmProjectConfig | null,
): { executor: TaskExecutorPort; resolvedModel?: string } {
  // 1. Resolve task type
  const taskType = (String(task.task_type ?? "").trim() || "code_gen") as TaskType;
  const route = createTaskTypeRouter().route(
    taskType,
    projectConfig?.task_types?.[taskType],
  );

  // 2. Resolve model with router default
  const model = resolveModel(
    String(task.model ?? "").trim() || undefined,
    projectConfig?.executor?.model || route.default_model,
    process.env.AGENT_FARM_MODEL?.trim() || undefined,
  );

  // 3. Resolve executor with router default
  const executorId = resolveExecutorId(
    { ...task, executor: task.executor || route.default_executor },
    projectConfig,
  );

  // 4. Enrich prompt
  // (done in stage-execute, not here)

  // 5. Create executor
  const executor = /* ...existing logic... */;
  return { executor, resolvedModel: model };
}
```

---

## 6. 验收要点

1. Wave JSON 写 `"task_type": "doc_gen"` → `validate:waves` 通过
2. 无效 task_type（如 `"foo"`）→ `validate:waves` 报错
3. `task_type: "doc_gen"` 无 `model` → 自动路由到 `gpt-4o-mini`
4. `task_type: "doc_gen"` + `"model": "claude-opus"` → 用 `claude-opus`
5. `.agent-farm/config.json` 中 `task_types` 覆盖默认路由
6. prompt 自动追加 `prompt_suffix`
7. `npm run check && npm test` 全绿
