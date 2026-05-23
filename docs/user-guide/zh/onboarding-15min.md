# 15 分钟陌生人 Onboarding（M3）

目标：无口头指导完成 **安装 → 初始化 → 演示入队 → 控制面 → 健康门禁 → 嵌入 API 冒烟**。

自动检查（约 2 分钟）：

```bash
npm install && npm run build
npm run farm:onboarding:15min
```

通过后再按下面时间表做 **人工** 步骤（Cursor 侧栏 / worker）。

---

## 时间表

| 分钟  | 步骤        | 命令 / 动作                                                                 | 完成标志                                     |
| ----- | ----------- | --------------------------------------------------------------------------- | -------------------------------------------- |
| 0–3   | 安装 CLI    | `npm i -g github:BK201-Drama/agent-farm-cli` 或本仓库 `npm link`            | `agent-farm --version`                       |
| 3–5   | 初始化项目  | `agent-farm project init --target-dir .`                                    | 存在 `.agent-farm/queue/`、`.cursor/skills/` |
| 5–7   | 演示入队    | `agent-farm demo task --template noop`                                      | 输出 `demo-onboarding-*`                     |
| 7–9   | 健康门禁    | `agent-farm doctor --ci-exit`                                               | 退出码 **0**                                 |
| 9–12  | 控制面      | 装侧栏 VSIX 或 `npm run farm:control-plane`                                 | 见队列摘要；派一条测试 prompt                |
| 12–13 | MCP（可选） | `.cursor/mcp.json` + `npm run farm:mcp`                                     | `farm_queue_view` 与侧栏一致                 |
| 13–15 | Worker 一瞥 | `agent-farm worker --command-template 'echo {prompt}' --drain-idle-loops 1` | 一条任务 **done** 或 **review**              |

更短个人路径见 [个人 5 分钟](./install-quickstart-commands.md#个人-5-分钟首次上手)。团队 2 周见 [team-sprint-2w.md](../../playbooks/team-sprint-2w.md)。

---

## 控制面（推荐 Cursor 侧栏）

```bash
npm run farm:sidebar:build
# 安装 extensions/agent-farm-sidebar 生成的 VSIX
```

活动栏 **Agent Farm** → 看 stuck → 底部派活。详见 [cursor-m1-onboarding.md](../../integrations/cursor-m1-onboarding.md)。

---

## 程序化嵌入（可选）

```bash
node examples/embed-minimal/run.mjs
```

或 `import { ControlPlaneService } from "agent-farm-cli/core"`。稳定性说明见 [embed-api-stability.md](../../embed-api-stability.md)。

---

## 常见卡点

| 问题                    | 处理                                                       |
| ----------------------- | ---------------------------------------------------------- |
| `doctor --ci-exit` 非 0 | `agent-farm stuck list --brief`；处理 dedupe / stale       |
| 侧栏连不上              | `Agent Farm: Start Control Plane`；检查端口 `18765`        |
| 无 OpenCode             | `doctor` 可设 `AGENT_FARM_SKIP_OPENCODE_PROBE=1`（仅诊断） |

---

## 验收勾选（培训他人时用）

- [ ] `npm run farm:onboarding:15min` 绿
- [ ] 侧栏或浏览器完成一次派活
- [ ] `agent-farm queue list` 能看到自己的任务
- [ ] 读过 [collaboration-async-handoff.md](./collaboration-async-handoff.md) 角色分工
