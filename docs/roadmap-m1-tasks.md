# M1 任务拆解：Cursor 控制面

父文档：[roadmap-big-vision-3m.md](./roadmap-big-vision-3m.md)

Wave 文件：`.agent-farm/waves/m1-cursor-control-plane.json`（`npm run farm:m1:wave`）

| ID | mode | 交付 |
|----|------|------|
| m1-plan-executor-adr | plan | ADR：可插拔 executor + Cursor SDK 路径 |
| m1-plan-control-plane | plan | 控制面 API 与 Cursor 安装步骤 |
| m1-exec-control-plane-core | execute | ControlPlaneService + 单测 |
| m1-exec-http-panel | execute | HTTP 面板 + `/api/view` |
| m1-exec-mcp-server | execute | MCP 工具（与 API 同源） |
| m1-exec-cli-docs | execute | CLI `control-plane serve` + 用户文档 |
| m1-exec-bdd | execute | BDD：serve 起服 + API 冒烟 |

验收（M1 末）：Cursor Simple Browser 打开面板 → 见队列/stuck → MCP 或面板派一条 demo 任务。
