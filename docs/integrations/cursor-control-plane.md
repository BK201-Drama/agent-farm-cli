# Cursor 控制面 实现大纲（M1）

> 父文档：[`roadmap-big-vision-3m.md`](../roadmap-big-vision-3m.md) M1
> M1 任务拆解：[`roadmap-m1-tasks.md`](../roadmap-m1-tasks.md)

## 0. 验收标准（M1 末）

- Cursor Simple Browser 打开面板 → 见队列/stuck → MCP 或面板派一条 demo 任务
- 录屏 3 分钟内完成上述流程
- Cursor 调 MCP 与 CLI 结果一致

## 1. HTTP 面板

### 1.1 启动命令

```
agent-farm control-plane serve [--port <n>]
npm run farm:control-plane
```

### 1.2 面板 URL

```
http://127.0.0.1:18765/
```

- 默认端口 `18765`，`--port` 覆盖
- 仅监听 `127.0.0.1`，不暴露外网

### 1.3 页面功能（`GET /`）

| 区域 | 功能 | 说明 |
|------|------|------|
| 摘要栏 | 任务总数 + 管线数 + stuck 计数 + 生成时间戳 | 自动刷新 8s |
| Stuck 区 | stuck JSON 输出 | 与 `farm_stuck_list` MCP 工具同源 |
| 派活表单 | `textarea` 输入 prompt → 按钮入队 | 调用 `POST /api/dispatch` |
| 原始 JSON | 完整 `ControlPlaneView` | 与 `GET /api/view` 同源 |
| 刷新按钮 | 手动触发全量刷新 | `—` |

### 1.4 API 端点

| 方法 | 路径 | 说明 | Request Body | Response |
|------|------|------|-------------|----------|
| `GET` | `/` / `/index.html` | 自包含 HTML 面板（dark 主题） | — | `text/html` |
| `GET` | `/api/view` | 全量视图 JSON（= MCP `farm_queue_view`） | — | `ControlPlaneView` JSON |
| `POST` | `/api/dispatch` | 入队一条 execute 任务 | `{ "prompt": "…", "dedupe_key?": "…" }` | `{ "ok": true, "task": {…} }` |
| `POST` | `/api/stuck/retry` | 单任务标为 retry | `{ "task_id": "…", "reason?": "…" }` | 同 `agent-farm stuck retry` |
| `POST` | `/api/stuck/recover` | 批量 recover-stale | `{ "lease_timeout_seconds?": 1800 }` | 同 `agent-farm stuck recover` |

#### `ControlPlaneView` JSON 形状

```ts
{
  ok: boolean;
  generated_at: string;          // ISO timestamp
  queue_workspace: {             // 队列工作区
    cwd: string;
    storage: "sqlite" | "jsonl";
    dbFile: string;
    taskFile: string;
    // ...
  };
  board: {                       // 看板快照
    pipeline: TaskItem[];        // 管线中任务
    history: TaskItem[];         // 归档任务
  };
  status: {                      // 状态计数
    tasks_total: number;
    status_counts: Record<string, number>;
  };
  stuck: StuckReport;            // = farm_stuck_list 输出
}
```

### 1.5 数据源

所有端点共享同一个 `ControlPlaneService` 实例，底层调用：
- `doctorService.build()` → stuck 诊断
- `insightsService.buildBoardSnapshot()` → 看板
- `statusService.build()` → 状态计数
- `queueService.addTask()` → 派活入队

## 2. MCP 配置

### 2.1 配置片段（`.cursor/mcp.json`）

在仓库根目录创建 `.cursor/mcp.json`：

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

- 需要先 `npm run build` 生成 `dist/interfaces/mcp/server.js`
- 直接运行：`npm run farm:mcp` 或 `agent-farm-mcp`

### 2.2 MCP 工具清单

| 工具名 | 说明 | 参数 | 返回 | 与面板/CLI 同源 |
|--------|------|------|------|-----------------|
| `farm_queue_view` | 队列快照 + status + stuck | 无 | `ControlPlaneView` JSON | `GET /api/view` |
| `farm_stuck_list` | 仅 stuck 诊断条目 | 无 | `StuckReport` JSON | `GET /api/view` → `.stuck` |
| `farm_dispatch_task` | 入队一条 execute 任务 | `prompt` (string, required)<br>`dedupe_key` (string, optional) | `{ "ok": true, "task": {…} }` | `POST /api/dispatch` |

### 2.3 `StuckReport` JSON 形状

```ts
{
  ok: boolean;
  items: StuckItem[];            // stuck 条目列表
  retryable_count: number;       // 可 retry 条目数
  high_severity_count: number;   // 高优先级条目数
  doctor_ok: boolean;            // doctor 整体健康
}

// StuckItem
{
  kind: "stale_running" | "heartbeat_missing" | "duplicate_dedupe"
      | "review_overdue" | "failure_hotspot";
  severity: "high" | "medium";
  task_id?: string;
  dedupe_key?: string;
  summary: string;               // 人类可读摘要
  suggested_action: "retry" | "recover_stale" | "resolve_dedupe" | "review" | "inspect";
  suggested_command: string;     // 推荐 CLI 命令
  meta?: { age_seconds?: number };
}
```

### 2.4 环境变量

MCP 服务进程继承启动环境的变量，与 CLI 一致：

| 变量 | 说明 |
|------|------|
| `AGENT_FARM_STORAGE` | 队列存储类型（`sqlite` / `jsonl`） |
| `AGENT_FARM_SKIP_OPENCODE_PROBE` | 跳过 OpenCode 检测 |
| 其他 | 与 `agent-farm` CLI 相同 |

## 3. Dashboard / Stuck 命令对照表

### 3.1 控制面 ↔ CLI 完整对照

| 控制面操作 | MCP 工具 | HTTP API | CLI 等价命令 |
|-----------|----------|----------|-------------|
| 看队列全貌 | `farm_queue_view` | `GET /api/view` | `agent-farm queue snapshot`<br>`agent-farm dashboard` |
| 看 stuck | `farm_stuck_list` | `GET /api/view` → `.stuck` | `agent-farm stuck list`<br>`agent-farm stuck list --brief` |
| 派活 | `farm_dispatch_task` | `POST /api/dispatch` | `agent-farm queue add --prompt "…"`<br>`./scripts/agent-farm-dispatch.sh "…"` |
| 单任务 retry | — | `POST /api/stuck/retry` | `agent-farm stuck retry --task-id <id>` |
| 批量 recover | — | `POST /api/stuck/recover` | `agent-farm stuck recover` |
| 其它 stuck | — | — | 侧栏 **复制命令** 或 CLI |
| 健康巡检 | — | — | `agent-farm doctor`<br>`agent-farm doctor --ci-exit`<br>`npm run farm:doctor:ci` |
| 状态行 | — | — | `npm run farm:status:line` |
| 看板终端 | — | — | `agent-farm dashboard [--opencode-feed]` |

### 3.2 `dashboard` vs 控制面面板 功能对比

| 功能 | `dashboard` (Ink TUI) | 控制面 HTTP 面板 |
|------|----------------------|------------------|
| 展示形式 | 终端全屏 TUI | 浏览器 HTML |
| 管线表 | 实时列布局（pulse/status/hb/topic/task_id/prompt） | JSON 原始数据 |
| 归档表 | 实时列布局（when/status/error/task_id/prompt） | JSON 原始数据 |
| 搜索过滤 | `/` 键交互过滤 | 无 |
| 任务详情 | Enter 键弹窗 | 无 |
| OpenCode feed | `--opencode-feed` 底部面板 | 无 |
| Stuck 展示 | 无独立 stuck 区 | 独立 stuck pre 区 |
| 派活 | 无表单 | 有 textarea + 按钮 |
| 自动刷新 | `--refresh-ms`（默认 900ms） | 8s 固定间隔 |
| 离线 JSON 输出 | `--plain` 模式逐行 JSON | `GET /api/view` |
| 彩色 | Ink colors（dark/light 主题） | CSS dark 主题 |

### 3.3 `stuck list` vs `farm_stuck_list` MCP 工具 功能对比

| 功能 | `stuck list` CLI | `farm_stuck_list` MCP |
|------|------------------|----------------------|
| 输出格式 | JSON（默认）或 `--brief` 人类可读 | JSON（StuckReport） |
| 诊断种类 | stale_running / heartbeat_missing / duplicate_dedupe / review_overdue / failure_hotspot | 同（同源数据） |
| 重试命令 | 每项输出 `suggested_command` | 每项输出 `suggested_command` |
| 可配置参数 | `--lease-timeout-seconds` / `--review-overdue-hours` / `--top-n` | 固定默认值（1800s / 2h / 5） |
| 后续动作 | `stuck retry` / `stuck recover` | 无写操作（M1 只读为主） |

## 4. M1 实现清单

按 `roadmap-m1-tasks.md` 拆解，标注当前状态与验收要点。

| 任务 ID | 交付 | 状态 | 验收要点 |
|---------|------|------|----------|
| `m1-plan-executor-adr` | ADR：可插拔 executor + Cursor SDK 路径 | 待实现 | ADR 文档 + 插件接口草案 |
| `m1-plan-control-plane` | 控制面 API 与 Cursor 安装步骤 | ✅ 本大纲 | HTTP / MCP 安装步骤完整 |
| `m1-exec-control-plane-core` | `ControlPlaneService` + 单测 | ✅ 已实现 | `src/application/facades/control-plane.ts` + 测试 |
| `m1-exec-http-panel` | HTTP 面板 + `/api/view` | ✅ 已实现 | `src/interfaces/control-plane/http-server.ts` |
| `m1-exec-mcp-server` | MCP 工具（与 API 同源） | ✅ 已实现 | `src/interfaces/mcp/server.ts` |
| `m1-exec-cli-docs` | CLI `control-plane serve` + 用户文档 | ✅ 本大纲 | 第 1、2 节即为用户文档 |
| `m1-exec-bdd` | BDD：serve 起服 + API 冒烟 | 待实现 | HTTP 启动 → `/api/view` 返回 200 → `/api/dispatch` 入队成功 |

### 4.1 M1 Wave 入队

```bash
npm run build && npm run farm:m1:wave
```

## 5. 侧栏扩展（`extensions/agent-farm-sidebar`）

活动栏 **Agent Farm → Queue**，Webview 轮询同一套 HTTP API，无需 Simple Browser。

| 步骤 | 操作 |
|------|------|
| 构建 CLI | 仓库根：`npm run build` |
| 构建扩展 | `cd extensions/agent-farm-sidebar && npm install && npm run build` |
| 调试 | 用 Cursor 打开 `extensions/agent-farm-sidebar`，F5 **Run Agent Farm Sidebar**（宿主工作区指向仓库根） |
| 使用 | 活动栏 Agent Farm 图标 → 看队列 / stuck → 底部 textarea 派活 |

- 默认 `agentFarm.autoStartServer=true`：侧栏会 spawn `control-plane serve`（优先 `dist/interfaces/cli/index.js`）
- 若已 `npm run farm:control-plane`，直接连 `127.0.0.1:18765`
- 完整面板：**Agent Farm: Open in Browser** → `http://127.0.0.1:18765/`
- Stuck 卡片：**Retry** / **Recover**（调用上表 API）；其余项 **复制命令**
- 终端 worker：**Agent Farm: Start Worker in Terminal** → `agent-farm worker`

### 安装 VSIX（免 F5 调试）

```bash
npm run build
npm run farm:sidebar:package
```

在 Cursor：**Extensions → … → Install from VSIX…** → 选 `extensions/agent-farm-sidebar/agent-farm-sidebar-0.2.0.vsix`。

## 6. 架构速览

```
              ControlPlaneService
         (src/application/facades/control-plane.ts)
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
   HTTP Server      MCP stdio        CLI 命令
   127.0.0.1:18765  (server.js)     (stuck list 等)
       │               │
  GET  /api/view   farm_queue_view   ← 同源 JSON
  POST /api/dispatch farm_dispatch_task ← 同源逻辑
  GET  /            ——                ← HTML 面板
```
