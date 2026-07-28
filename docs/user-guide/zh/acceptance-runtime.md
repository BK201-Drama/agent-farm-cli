# Spec Acceptance Runtime（验收运行时）

Spec Acceptance Runtime 提供**规格驱动**的验收流程：定义 JSON 验收规格 → 自动入队验收任务 → 跟踪进度 → 运行 demo → 判定整体完成。

## 设计目标

- **规格即文档**：一份 JSON 定义整个 POC 的机器可验证验收项与 demo 验收
- **并行执行**：验收项通过 agent-farm 队列并行执行，依赖关系自动编排
- **状态可观测**：CLI / MCP 随时查询验收进度；done = 所有 item pass + demo pass

## 快速开始

### 1. 编写验收规格

参考 `schemas/acceptance.schema.json` 与 `examples/acceptance/noop-poc.json`：

```json
{
  "poc_id": "my-feature",
  "code_root": ".",
  "demo": {
    "id": "smoke",
    "how": "运行端到端冒烟测试",
    "verify": "npm run test:e2e"
  },
  "items": [
    {
      "id": "unit-tests",
      "title": "单元测试全部通过",
      "verify": "npm test",
      "needs_human": false,
      "depends_on": []
    },
    {
      "id": "lint",
      "title": "代码风格检查",
      "verify": "npm run lint",
      "needs_human": false,
      "depends_on": []
    },
    {
      "id": "manual-review",
      "title": "人工代码审查",
      "verify": null,
      "needs_human": true,
      "depends_on": ["unit-tests", "lint"]
    }
  ]
}
```

### 2. 加载验收规格

```bash
agent-farm acceptance load --spec path/to/my-feature.json
```

此命令：
- 解析 JSON 规格
- 初始化进度文件（`.agent-farm/acceptance/{poc_id}.json`）
- 将 `pending` 状态的验收项入队（`blocked` 项等待依赖满足后解锁）

### 3. 运行 worker 执行验收任务

```bash
agent-farm worker --workers 2 --command-template '<your-executor> {prompt}'
```

验收项入队后使用标准 agent-farm worker 消费执行。任务 dedupe_key 格式为 `acceptance__{poc_id}__{item.id}`（避免 Windows 路径中的冒号）。

### 4. 查询验收状态

```bash
agent-farm acceptance status --poc my-feature
```

输出示例：

```json
{
  "ok": true,
  "poc_id": "my-feature",
  "done": false,
  "demo": "ready",
  "items": {
    "unit-tests": "pass",
    "lint": "pass",
    "manual-review": "awaiting_human"
  },
  "updated_at": "2026-07-29T12:00:00.000Z"
}
```

`done` 为 `true` 当且仅当所有 item 为 `pass` 且 demo 为 `pass`。

### 5. 运行 Demo 验收

```bash
agent-farm acceptance demo --poc my-feature
```

前提：所有 item 均已 `pass`。否则抛出 `DemoBlockedError`，列出未通过的项目 ID。

Demo 在 `code_root` 下执行 `demo.verify` 命令：
- `exit 0` → demo `pass`
- `exit != 0` → demo `fail`

### 6. 确认整体完成

```bash
agent-farm acceptance status --poc my-feature
# done: true 表示全部通过
```

## 验收项状态机

| 状态              | 含义                       |
| ----------------- | -------------------------- |
| `pending`         | 等待入队执行               |
| `blocked`         | 依赖未满足，等待解锁       |
| `running`         | worker 正在执行中          |
| `verifying`       | 执行完毕，验证中           |
| `awaiting_human`  | 需要人工判断（review 状态）|
| `pass`            | 验收通过                   |
| `fail`            | 验收失败                   |

## Demo 状态机

| 状态     | 含义                       |
| -------- | -------------------------- |
| `locked` | 尚未解锁（item 未全 pass） |
| `ready`  | 所有 item pass，可执行     |
| `running`| demo 执行中                |
| `pass`   | demo 通过                  |
| `fail`   | demo 失败                  |

## 依赖编排

`depends_on` 字段定义验收项间的依赖关系。被依赖的项全部 `pass` 后，依赖项自动从 `blocked` → `pending`。

```json
{
  "items": [
    { "id": "a", "depends_on": [] },
    { "id": "b", "depends_on": ["a"] },
    { "id": "c", "depends_on": ["a", "b"] }
  ]
}
```

执行顺序：`a` → `b`（a pass 后解锁）→ `c`（a 和 b 都 pass 后解锁）。

## 人工验收项

`needs_human: true` 的验收项 `verify` 可为 `null`。此类任务入队后，worker 完成进入 `review` 状态 → 映射为验收 `awaiting_human` 状态。人工 approve 后 → `approved` → 映射为 `pass`。

## MCP 工具

Cursor 内可通过 MCP 查询验收状态（无需终端）：

```json
{
  "mcpServers": {
    "agent-farm": {
      "command": "node",
      "args": ["dist/interfaces/mcp/server.js"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

工具：`farm_acceptance_status`（参数 `poc_id`）。

## 进度文件

进度持久化在 `.agent-farm/acceptance/{poc_id}.json`：

```json
{
  "poc_id": "my-feature",
  "code_root": ".",
  "updated_at": "2026-07-29T12:00:00.000Z",
  "items": {
    "unit-tests": "pass",
    "lint": "pass"
  },
  "demo": "ready",
  "spec_snapshot": { /* 原始 spec，用于对比是否过期 */ }
}
```

## JSON Schema

验收规格的 JSON Schema 位于 `schemas/acceptance.schema.json`，可用于编辑器自动补全与校验。
