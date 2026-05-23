# 大方向：3 个月「可嵌入的 AI 流水线基础设施」

> 由产品问答收敛（2026-05）。执行时与 [`product-trust-sprint.md`](./product-trust-sprint.md)、[`roadmap-one-week-personal-team-ci.md`](./roadmap-one-week-personal-team-ci.md) 并列阅读。

## 一句话愿景

**agent-farm 成为可嵌入的开源基础设施：CLI + 完整 TS Facade，让个人与小团队把「plan → execute → verify → review」跑成可观测、可恢复、可复制的流水线；Cursor 里是控制面，OpenCode / Cursor SDK 等是可插拔执行器。**

## 北极星与成功标准（3 个月）

| 维度         | 选择                                                                                   |
| ------------ | -------------------------------------------------------------------------------------- |
| **时间**     | 3 个月内：陌生人能装能用（文档 + 默认路径）                                            |
| **定位**     | 开源基础设施（他人嵌入自己的 agent 栈）                                                |
| **用户**     | 个人为主；团队路径须能复制                                                             |
| **差异化**   | 可见性、可恢复、可重复、可治理、成本可控 — **分期全做**                                |
| **成功画面** | **至少 1 个熟悉团队**把 farm 当 2 周真实 sprint 的标准流程（你以单人为主，协作是增强） |
| **托管**     | **3 个月内不实现**远程队列/SaaS                                                        |

## 明确不做（3 个月）

- SaaS、计费、多租户云控制台
- 大企业 RBAC / SSO
- （未选但建议保持）替代 Git/PR、替代 Cursor 本体

## 技术押注（按优先级）

1. **IDE 原生（M1 主战场）** — Cursor **侧边面板级**集成（非仅状态行）
2. **流水线节点契约** — plan/execute/verify 结构化输出 + 校验（已在 0.1.44+ 起步）
3. **可嵌入 API** — **完整 application facade** 对外 export，semver 约束
4. **可插拔 executor** — 正式插件接口；**首个备选：Cursor Agent SDK**
5. **可靠性与上手** — E2E、多平台 CI、15 分钟陌生人路径
6. **生态** — 示例仓库、嵌入文档（随 API 稳定推进）
7. **托管** — 不实现，仅架构留白

## 嵌入形态（主形态）

- **主**：`agent-farm-cli` + **可编程 TS API**（Queue / Doctor / Stuck / Insights 等 facade）
- **辅**（服务面板）：**MCP** 读状态、派活、看 stuck（与面板同源数据）
- **契约**：`schemas/`、jsonl/sqlite 队列文件（语言无关集成仍支持）

## 三个月里程碑（建议分期）

### M1（第 1 个月）— Cursor 控制面「能演示」

**目标**：在 Cursor 里完成「看队列 → 看 stuck → 派一条任务」而不必切终端。

| 交付                                                                          | 验收                               |
| ----------------------------------------------------------------------------- | ---------------------------------- |
| Cursor **侧边面板 MVP**（队列摘要、stuck 入口、最近失败）                     | 录屏 3 分钟内完成上述流程          |
| **MCP 工具**与面板同源（`queue snapshot` / `stuck list` / `dispatch` 最小集） | Cursor 调 MCP 与 CLI 结果一致      |
| 深化 `farm:status:line` / Skill 链到面板                                      | 文档一键安装步骤                   |
| Executor **插件接口草案** + ADR                                               | 代码里 OpenCode 路径不变，接口可测 |

**风险**：面板 + MCP 工作量大 → M1 末至少 **MVP 面板 + 只读 MCP**；完整交互可延续到 M2 前两周。

### M2（第 2 个月）— 流水线契约 + 团队可复制

| 交付                                                                | 验收                         |
| ------------------------------------------------------------------- | ---------------------------- |
| plan/execute/verify **节点报告**统一 schema + `validate:waves` 扩展 | CI 校验官方 wave             |
| **官方团队 playbook**（2 周 sprint：wave → review → merge）         | 熟悉团队按文档跑通 1 个迭代  |
| **@agent-farm/core** 或稳定 export 清单 + 2 个 examples             | 外部示例 repo `npm i` 即可跑 |
| Executor：**Cursor SDK** 最小插件实现                               | 1 条任务 end-to-end          |

### M3（第 3 个月）— 陌生人产品化 + 团队验收

| 交付                                                                      | 验收                 |
| ------------------------------------------------------------------------- | -------------------- |
| **15 分钟 onboarding**（install → init → demo → dashboard/面板 → doctor） | 新人无口头指导完成   |
| Facade **semver 1.0 候选**（破坏性变更进 major）                          | CHANGELOG + 迁移说明 |
| E2E：`demo → worker → execute 报告 → review`（可选 @slow）                | CI 绿                |
| **团队验收**：熟悉团队 2 周标准使用                                       | 复盘文档 / 问题清单  |

## 与当前版本（0.1.45）的关系

已具备地基：

- 个人 → CI 路径、stuck 中心、execute JSON 报告、`--timeline`
- doctor / health cron、wave 样例、validate:waves（含 plan/execute 规则）

大方向是在此之上加 **控制面（Cursor）**、**嵌入 API**、**executor 插件化**，而非重写 domain/application。

## 下一步（你已选：路线图 + 开干 M1）

1. 本文件进 [`docs/agents/README.md`](./agents/README.md) 索引（可选）
2. 拆 M1 Epic：`cursor-panel-mvp`、`mcp-queue-tools`、`executor-plugin-adr`
3. 实现顺序：**MCP 只读 + 数据层** → **Ink/React 面板壳** → **派活写路径**

---

**请确认**：若认可本路线图，回复「按 M1 开干」或调整 M1 范围（例如面板降为 MCP-only 以提速）。
