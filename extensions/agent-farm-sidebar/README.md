# Agent Farm Sidebar（Cursor / VS Code）

活动栏 **Agent Farm** 侧栏：队列摘要、管线、stuck、派活。数据与 `agent-farm control-plane serve` / MCP `farm_queue_view` 同源。

## 安装

### 方式 A：VSIX（推荐日常使用）

```bash
# 仓库根
npm run build
npm run farm:sidebar:package
```

Cursor → **Extensions** → **…** → **Install from VSIX…** → 选择生成的 `agent-farm-sidebar-*.vsix`。

### 方式 B：F5 调试

```bash
npm run build
cd extensions/agent-farm-sidebar && npm install && npm run build
```

用 Cursor 打开 `extensions/agent-farm-sidebar` 目录，F5 **Run Agent Farm Sidebar**。

## 使用

1. 打开 agent-farm 项目根为工作区
2. 活动栏 **Agent Farm** → **Queue**
3. Stuck 项可点 **Retry** / **Recover**；其它项 **复制命令**
4. 命令面板：**Agent Farm: Start Worker in Terminal**（`agent-farm worker`）

侧栏会自动拉起 control-plane（可关 `agentFarm.autoStartServer`）。

## 设置

| 键 | 默认 | 说明 |
|----|------|------|
| `agentFarm.port` | `18765` | control-plane 端口 |
| `agentFarm.cliPath` | 空 | 自定义 CLI；空则 `dist/` → `node_modules/.bin` → PATH |
| `agentFarm.autoStartServer` | `true` | 打开侧栏时自动 `control-plane serve` |

## 命令

- **Agent Farm: Refresh**
- **Agent Farm: Start Control Plane**
- **Agent Farm: Open in Browser**
- **Agent Farm: Start Worker in Terminal**

详见仓库根目录 `docs/integrations/cursor-control-plane.md`。
