# Cursor 控制面（M1）

在 Cursor 内查看队列、stuck 与派活，无需反复开终端。

## 1. HTTP 面板（侧边 Simple Browser）

```bash
npm run build
npm run farm:control-plane
# 或 agent-farm control-plane serve --port 18765
```

浏览器或 Cursor **Simple Browser** 打开：<http://127.0.0.1:18765/>

- 自动刷新队列摘要与 stuck 列表
- 表单提交 `POST /api/dispatch` 入队

API：

- `GET /api/view` — 与 MCP `farm_queue_view` 同源 JSON
- `POST /api/dispatch` — body `{ "prompt": "…", "dedupe_key?": "…" }`

## 2. MCP（Cursor 工具）

构建后在本仓库根 `.cursor/mcp.json`（示例）：

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

工具：

| 工具 | 说明 |
|------|------|
| `farm_queue_view` | 队列快照 + status + stuck |
| `farm_stuck_list` | 仅 stuck 条目 |
| `farm_dispatch_task` | 入队一条 execute 任务 |

环境变量与 CLI 一致（`AGENT_FARM_STORAGE`、`AGENT_FARM_SKIP_OPENCODE_PROBE` 等）。

## 3. 与 CLI 对照

| 控制面 | CLI 等价 |
|--------|----------|
| 面板摘要 | `agent-farm queue snapshot` / `dashboard` |
| stuck | `agent-farm stuck list` |
| 派活 | `agent-farm queue add --prompt "…"` |

## M1 Wave

`npm run farm:m1:wave` — 入队 `.agent-farm/waves/m1-cursor-control-plane.json` 并启动 worker。

任务索引：[`docs/roadmap-m1-tasks.md`](../roadmap-m1-tasks.md)
