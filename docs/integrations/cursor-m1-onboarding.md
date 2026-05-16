# Cursor M1 上手（约 3 分钟）

验收：在 Cursor 内 **看队列 → 看 stuck → 派一条任务**，无需记终端命令。

## 1. 准备（一次性）

```bash
npm run build   # 本仓库开发；或 npm i -g agent-farm-cli
agent-farm project init
```

- 配置 `.agent-farm/profile.env`
- MCP：根目录 `.cursor/mcp.json` 指向 `agent-farm-mcp`（见 [cursor-control-plane.md](./cursor-control-plane.md)）

## 2. 侧栏（推荐）

```bash
npm run farm:sidebar:build
```

Cursor → 安装 `extensions/agent-farm-sidebar` 的 VSIX 或 F5 调试 → 活动栏 **Agent Farm → Queue**。

## 3. 三条路径对照

| 能力 | 侧栏 | MCP 工具 | HTTP |
|------|------|----------|------|
| 看队列 | 自动刷新 | `farm_queue_view` | `GET /api/view` |
| 看 stuck | Stuck 区 | `farm_stuck_list` | 同上 `.stuck` |
| 派活 | 底部 textarea | `farm_dispatch_task` | `POST /api/dispatch` |
| Retry | 按钮 | `farm_stuck_retry` | `POST /api/stuck/retry` |
| worker 提示 | health 行 | `farm_control_plane_health` | `GET /api/health` |

## 4. 跑 worker

命令面板：**Agent Farm: Start Worker in Terminal**，或：

```bash
agent-farm worker --workspace .
```

## 5. 录屏检查清单

- [ ] 侧栏显示状态 badge
- [ ] 派活后管线出现新任务
- [ ] （可选）制造 stuck 后点 Retry
- [ ] MCP `farm_queue_view` 与侧栏 JSON 一致

下一步：[team-sprint-2w.md](../playbooks/team-sprint-2w.md)（M2 团队 playbook）。
