# 团队 2 周 Sprint Playbook（M2）

> 基于 [collaboration-async-handoff.md](../user-guide/zh/collaboration-async-handoff.md) 与 [roadmap-big-vision-3m.md](../roadmap-big-vision-3m.md) M2 验收。

## 目标

熟悉团队在 **2 个自然周**内用 agent-farm 完成：拆 wave → 入队 → worker 执行 → review → 合并，且 **doctor CI 绿**。

## 第 0 天（30 分钟）

| 步骤 | 命令 / 动作 |
|------|-------------|
| 安装 | `npm i agent-farm-cli` 或 clone 本仓库 `npm run build` |
| 初始化 | `agent-farm project init`（sqlite + cursor + opencode） |
| 密钥 | `.agent-farm/profile.env` |
| 控制面 | 侧栏 **Agent Farm** 或 `npm run farm:control-plane` |
| MCP | 根目录 `.cursor/mcp.json` → `npm run farm:mcp` |
| 健康 | `npm run farm:doctor:ci` exit 0 |

## 第 1 周：个人熟练 + 第一条 wave

| 天 | 交付 |
|----|------|
| 1–2 | 跑通 `examples/waves/team-handoff-min.json`：`npm run farm:wave -- examples/waves/team-handoff-min.json` |
| 3–4 | 自写 3–5 条 plan→execute wave，`npm run validate:waves` |
| 5 | worker 长驻终端；侧栏处理 1 次 stuck（Retry / Recover） |

**验收**：至少 1 条 execute **done** + `queue show <id> --timeline` 可读。

## 第 2 周：异步协作 + CI

| 天 | 交付 |
|----|------|
| 1–2 | 角色分工：A 写 wave，B 跑 worker，A review-approve |
| 3 | 启用 GitHub `agent-farm-health-cron`（或 `npm run ci:health:local`） |
| 4 | insights artifact 归档；失败 issue 流程走一遍 |
| 5 | 复盘：stuck 条目、空转、prompt 质量（`validate:waves:strict:examples`） |

**验收**：2 人无需口头同步完成一轮 handoff；`doctor --ci-exit` 在 main 绿。

## 推荐 wave 结构

```json
[
  { "task_id": "sprint-plan-1", "mode": "plan", "dedupe_key": "sprint-plan", "prompt": "…验收…", "acceptance_criteria": "…" },
  { "task_id": "sprint-exec-1", "mode": "execute", "dedupe_key": "sprint-exec", "prompt": "…", "acceptance_criteria": "…" }
]
```

可选第三条 `mode=verify`：专跑验收脚本（见 `validate:waves` 对 verify 的规则）。

## 禁止事项

- 禁止直连 `.agent-farm/queue/agent_farm.db`（见 [queue-database-rules.md](../agents/queue-database-rules.md)）
- 禁止无 `acceptance_criteria` 的 execute 入队（CI `validate:waves` 会拦）

## 可选：Cursor SDK 执行

若团队统一使用 Cursor API 而非本地 OpenCode CLI：见 [cursor-sdk-executor.md](../integrations/cursor-sdk-executor.md)（`AGENT_FARM_EXECUTOR=cursor-sdk` + `CURSOR_API_KEY`）。

## 相关文档

- [cursor-m1-onboarding.md](../integrations/cursor-m1-onboarding.md)
- [wave-prompt-playbook.md](../agents/wave-prompt-playbook.md)
- [ADR-001 可插拔 executor](../adr/001-pluggable-executor.md)
