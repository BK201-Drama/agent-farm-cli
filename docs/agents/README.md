# Agent 协作文档（渐进式披露）

本目录拆自根目录 **`AGENTS.md`**：入口只保留必读条；按角色/主题再读下列文档。命令与参数仍以 **`README.md`**（及 **[`../user-guide/README.md`](../user-guide/README.md)** 分章）为准；任务 JSON / CLI 契约见 **`../harness-contracts.md`**。

| 文档                                                                                               | 何时读                                                           |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [dispatch-and-environment.md](./dispatch-and-environment.md)                                       | Wave 入队、OpenCode 调用方式、密钥与存储路径                     |
| [wave-authoring.md](./wave-authoring.md)                                                           | 写 wave、dedupe、prompt、粒度、plan/execute、验收                |
| [wave-prompt-playbook.md](./wave-prompt-playbook.md)                                               | Prompt 模板、空转约束、validate:waves / 严格 lint                |
| [queue-database-rules.md](./queue-database-rules.md)                                               | 为何禁止直连 SQLite 队列库、合法操作入口                         |
| [source-layout.md](./source-layout.md)                                                             | 改本仓库代码时进哪一层、目录职责                                 |
| [doctor-insights-brief.md](./doctor-insights-brief.md)                                             | `doctor` / `insights` 的 `--brief` 行为                          |
| [../integrations/github-actions-health.md](../integrations/github-actions-health.md)               | GitHub Actions 定时巡检、`doctor --ci-exit`、`demo task`         |
| [../roadmap-one-week-personal-team-ci.md](../roadmap-one-week-personal-team-ci.md)                 | 一周加班版：个人→团队→CI 路线与验收                              |
| [../roadmap-phase2-personal-team-ci.md](../roadmap-phase2-personal-team-ci.md)                     | 第二轮拓展 40 项（Phase 2，合并后加固）                          |
| [../roadmap-big-vision-3m.md](../roadmap-big-vision-3m.md)                                         | **大方向**：3 个月可嵌入基础设施 + Cursor 控制面                 |
| [../roadmap-m1-tasks.md](../roadmap-m1-tasks.md)                                                   | **M1** 任务拆解 + wave                                           |
| [../roadmap-m2-tasks.md](../roadmap-m2-tasks.md)                                                   | **M2** 契约 / 嵌入 / playbook                                    |
| [../roadmap-m3-tasks.md](../roadmap-m3-tasks.md)                                                   | **M3** 15min onboarding / 嵌入 semver / 产品化                   |
| [../roadmap-m4-plus-intelligence.md](../roadmap-m4-plus-intelligence.md)                           | **M4+** 智能化增量：多模型路由 / 自动拆 wave / 算力调度 / 知识库 |
| [m4-model-router-design.md](./m4-model-router-design.md)                                           | M4 多模型路由设计：model 字段 / 三级优先级 / executor 传参       |
| [m4-task-type-router-design.md](./m4-task-type-router-design.md)                                   | M4 任务类型路由器：task_type / 7 种类型 / 自动路由策略           |
| [../user-guide/zh/onboarding-15min.md](../user-guide/zh/onboarding-15min.md)                       | 陌生人 15 分钟路径                                               |
| [../embed-api-stability.md](../embed-api-stability.md)                                             | `agent-farm-cli/core` 稳定性                                     |
| [../integrations/cursor-control-plane.md](../integrations/cursor-control-plane.md)                 | Cursor 面板 / MCP 安装                                           |
| [../integrations/cursor-m1-onboarding.md](../integrations/cursor-m1-onboarding.md)                 | M1 三分钟上手                                                    |
| [../playbooks/team-sprint-2w.md](../playbooks/team-sprint-2w.md)                                   | 团队 2 周 sprint                                                 |
| [../adr/001-pluggable-executor.md](../adr/001-pluggable-executor.md)                               | ADR：可插拔 executor                                             |
| [../integrations/cursor-sdk-executor.md](../integrations/cursor-sdk-executor.md)                   | Cursor SDK 作 execute executor                                   |
| [../user-guide/zh/collaboration-async-handoff.md](../user-guide/zh/collaboration-async-handoff.md) | 两人协作：谁 enqueue / worker / review                           |
| [../../test/bdd/README.md](../../test/bdd/README.md)                                               | BDD → TDD 约定与场景索引                                         |
| [../contributing-pr.md](../contributing-pr.md)                                                     | 合并 PR 与发布清单                                               |
