# Agent 协作文档（渐进式披露）

本目录拆自根目录 **`AGENTS.md`**：入口只保留必读条；按角色/主题再读下列文档。命令与参数仍以 **`README.md`**（及 **[`../user-guide/README.md`](../user-guide/README.md)** 分章）为准；任务 JSON / CLI 契约见 **`../harness-contracts.md`**。

| 文档 | 何时读 |
|------|--------|
| [dispatch-and-environment.md](./dispatch-and-environment.md) | Wave 入队、OpenCode 调用方式、密钥与存储路径 |
| [wave-authoring.md](./wave-authoring.md) | 写 wave、dedupe、prompt、粒度、plan/execute、验收 |
| [queue-database-rules.md](./queue-database-rules.md) | 为何禁止直连 SQLite 队列库、合法操作入口 |
| [source-layout.md](./source-layout.md) | 改本仓库代码时进哪一层、目录职责 |
| [doctor-insights-brief.md](./doctor-insights-brief.md) | `doctor` / `insights` 的 `--brief` 行为 |
| [../integrations/github-actions-health.md](../integrations/github-actions-health.md) | GitHub Actions 定时巡检、`doctor --ci-exit`、`demo task` |
| [../roadmap-one-week-personal-team-ci.md](../roadmap-one-week-personal-team-ci.md) | 一周加班版：个人→团队→CI 路线与验收 |
| [../user-guide/zh/collaboration-async-handoff.md](../user-guide/zh/collaboration-async-handoff.md) | 两人协作：谁 enqueue / worker / review |
| [../../test/bdd/README.md](../../test/bdd/README.md) | BDD → TDD 约定与场景索引 |
| [../contributing-pr.md](../contributing-pr.md) | 合并 PR 与发布清单 |
