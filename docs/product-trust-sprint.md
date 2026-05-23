# 产品力 · 信任感冲刺（2 周）

目标用户：**个人开发者**；成功标准：**每天愿意用**（Cursor 派活 → farm → dashboard 收尾）。

产品主张：**可不断消化需求的处理器流水线，每个节点有可验收输出；卡住可一键恢复。**

## 任务清单与验收

| ID  | 任务                                                     | 验收                            |
| --- | -------------------------------------------------------- | ------------------------------- |
| T0  | 本文档 + harness 链                                      | 任务可追踪                      |
| T1  | `stuck list`：聚合 doctor 信号为人话条目                 | ✅ JSON + `--brief`             |
| T2  | `stuck retry --task-id`：一键重回 `retry`                | ✅ + BDD                        |
| T3  | `stuck recover`：批量 `recover-stale`                    | ✅                              |
| T4  | Execute 结构化 JSON 报告（`runs/<id>/execute-<n>.json`） | ✅ worker 落盘                  |
| T5  | Dashboard 顶栏：风险计数 + `stuck` 提示                  | ✅ `⚠stuck:N`                   |
| T6  | 单任务时间线（events + execute 报告）                    | ✅ `queue show <id> --timeline` |
| T7  | Cursor 状态行                                            | ✅ `npm run farm:status:line`   |
| T8  | plan 节点契约（validate:waves）                          | ✅ plan/execute 验收字段规则    |

## 非目标（4 周内不做）

多租户、托管 SaaS、计费、大团队 RBAC、新 worker 运行时。

## 相关命令

```bash
agent-farm stuck list
agent-farm stuck retry --task-id <id>
agent-farm stuck recover --lease-timeout-seconds 1800
agent-farm doctor --ci-exit
agent-farm dashboard
agent-farm queue show <task-id> --timeline
npm run validate:waves
```

契约补充见 **`docs/harness-contracts.md`**（`stuck retry` 语义）。
