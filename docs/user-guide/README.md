# User guide / 用户指南

渐进式阅读：根目录 **[README.md](../../README.md)** 保留最短安装与入口；细节按语言选读下列章节（**同一仓库内中英成对**，便于 npm 与 CI 读者各取所需）。

## 中文

| 章节                                                                            | 说明                                                             |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [安装、快速开始与命令总览](./zh/install-quickstart-commands.md)                 | 设计目标、安装、快速开始、`project init`、子命令列表             |
| [15 分钟陌生人 Onboarding](./zh/onboarding-15min.md)                            | 时间表、侧栏/MCP/worker、`npm run farm:onboarding:15min`         |
| [本仓库 dogfood、Wave 与 OpenCode](./zh/dogfood-wave-opencode.md)               | 本地迭代、Wave 示例、playbook、Token、看板说明                   |
| [异步协作与 wave 交接（中文）](./zh/collaboration-async-handoff.md)             | 谁入队、谁消费、dedupe、review/merge 与排错入口                  |
| [Cursor、数据目录与状态机](./zh/cursor-data-state.md)                           | 对接建议、`.agent-farm` 路径、状态流转                           |
| [与自有 Agent 集成](./zh/agent-integration.md)                                  | 命令模板占位符、worktree、verify、ai-review、verdict、执行器预设 |
| [Spec Acceptance Runtime（验收运行时）](./zh/acceptance-runtime.md)               | 规格驱动验收：JSON spec → 入队 → 跟踪 → demo → done              |
| [常见问题、发布与源码布局](./zh/faq-publish-architecture.md)                    | FAQ、npm 发布、目录树、替换存储                                  |
| [嵌入 API 稳定性](../../embed-api-stability.md)                                 | `agent-farm-cli/core` semver 与稳定 export                       |
| [侧栏 VSIX 发布](../../integrations/cursor-sidebar-publish.md)                  | `farm:sidebar:package` 与 Open VSX                               |
| [GitHub Actions 巡检与 demo 任务](../integrations/github-actions-health.md)     | 定时 `doctor --ci-exit`、失败 issue、`demo task`                 |
| [一周攻关：个人 → 团队 → CI（加班版）](../roadmap-one-week-personal-team-ci.md) | 7 日交付节奏、验收表、砍范围原则                                 |
| [第二轮拓展 40 项（Phase 2）](../roadmap-phase2-personal-team-ci.md)            | 合并后加固：validate:waves、链式 BDD、farm:doctor:ci             |

协作叙事另见 **[`../agents/README.md`](../agents/README.md)**；任务 JSON / CLI 契约见 **[`../harness-contracts.md`](../harness-contracts.md)**。贡献者合并清单 **[`../contributing-pr.md`](../contributing-pr.md)**；BDD 场景 **[`../../test/bdd/README.md`](../../test/bdd/README.md)**。

## English

| Chapter                                                                             | Description                                                                 |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Install, quick start & command overview](./en/install-quickstart-commands.md)      | Goals, install, quick start, `project init`, subcommands                    |
| [Dogfood, waves & OpenCode](./en/dogfood-wave-opencode.md)                          | Local iteration, wave JSON, playbook, tokens, dashboard                     |
| [Async collaboration & wave handoff (English)](./en/collaboration-async-handoff.md) | Who enqueues, who runs workers, dedupe, review/merge, troubleshooting links |
| [Cursor, data paths & state machine](./en/cursor-data-state.md)                     | IDE hints, `.agent-farm` layout, task states                                |
| [Integrating your own agent](./en/agent-integration.md)                             | Command templates, worktrees, verify, AI review, verdict JSON, executors    |
| [FAQ, publishing & source layout](./en/faq-publish-architecture.md)                 | FAQ, npm publish, tree, swapping storage                                    |
| [GitHub Actions health & demo tasks](../integrations/github-actions-health.md)      | Cron `doctor --ci-exit`, failure issues, `demo task`                        |
| [One-week push: personal → team → CI](../roadmap-one-week-personal-team-ci.md)      | 7-day plan, acceptance checks, explicit non-goals                           |

For contributor-oriented notes see **[`../agents/README.md`](../agents/README.md)** (Chinese index with deep links).
