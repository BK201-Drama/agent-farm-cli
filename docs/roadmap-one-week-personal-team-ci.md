# 一周攻关：个人 → 团队 → CI（加班版）

目标：在 **7 个自然日**内形成**可对外复制**的三段路径，每一段都有**可验收命令/工件**，避免只有概念没有落地。

开发与回归顺序（本仓库约定）：先写 BDD 场景再补实现，见 **[`test/bdd/README.md`](../test/bdd/README.md)**。

## 总原则

- **个人**：本机 10 分钟内跑通「队列 + 看板 + 健康门禁」。
- **团队**：不先上「共享神秘队列」，而是 **异步交接契约**（wave、dedupe、review、合并）可照文档复制。
- **CI**：GitHub Actions **可 fork 即用**，失败 **可见**（issue 或 job 摘要），成功 **静默**。

## Day 1–2：个人闭环（硬指标）

| 交付 | 验收 |
|------|------|
| 安装与最短路径 | 新目录下：`npm i agent-farm-cli` → `project init`（或等价）→ `demo task` → `dashboard --plain` 或 JSON 流能看懂 |
| 健康门禁 | `doctor --ci-exit` 在空队列/健康队列 **exit 0**；不健康样例 **exit 1** 有 stderr 原因 |
| 文档 | `docs/integrations/github-actions-health.md` 与 user-guide 索引已链到；补一节「个人 5 分钟」清单（若仍缺则写进 `docs/user-guide/zh/install-quickstart-commands.md` 小节） |

## Day 3–4：团队最小（异步交接）

| 交付 | 验收 |
|------|------|
| Wave 最小可复制 | 仓库内 **[`examples/waves/team-handoff-min.json`](../examples/waves/team-handoff-min.json)** + `enqueue`/`dispatch` 文档步骤；dedupe 规则写清；协作叙事见 **[`docs/user-guide/zh/collaboration-async-handoff.md`](./user-guide/zh/collaboration-async-handoff.md)** |
| Review 交接 | 文档写清：`review approve/reject`、与 merge 的关系；指向现有 `merge` 排错文档 |
| 角色分工建议 | `docs/agents/` 或 user-guide 增加「两人协作」一页：谁 enqueue、谁 worker、谁 review |

## Day 5–7：CI 闭环（与 GitHub 对齐）

| 交付 | 验收 |
|------|------|
| Cron + doctor | `.github/workflows/agent-farm-health-cron.yml` 在默认分支可 **workflow_dispatch** 绿跑 |
| insights（可选但建议） | 第二条 workflow 或同 job 增加 `insights --output-file` + artifact；失败策略与 doctor 一致或降级为 **summary** |
| 失败可见 | 维持 **issue-on-fail**；补充：权限被拒时的排错链（组织策略 / `GITHUB_TOKEN`） |
| 发布 | **semver + CHANGELOG** 写清迁移点；发一版 npm 作为「一周里程碑」 |

## 显式砍范围（防止一周爆掉）

- 不做重 Web 控制台、不做托管云、不做通用 monorepo 构建系统（与产品原则一致）。
- **matrix 多 workspace**：文档说明占位即可；代码矩阵第二项可延后到第 2 周，除非 Day5 前个人+团队已全绿。

## 每日站会自检（5 分钟）

1. 昨天合并到 `main` 的东西，**别人按文档能否复现**？  
2. 是否新增「必须读长文才懂」的步骤？是则 **缩路径或加默认**。  
3. CHANGELOG 是否当天记？升级的人会不会懵？

---

本文件为**加班版一周路线**的共识记录；执行时以 `CHANGELOG` 与 PR 粒度对齐交付。

## 验收状态（仓库内，2026-05-16）

| 段 | 状态 | 依据 |
|----|------|------|
| 个人 | 已落地 | `demo task`、`doctor --ci-exit`、用户指南 **[个人 5 分钟](./user-guide/zh/install-quickstart-commands.md#个人-5-分钟首次上手)**、`test/bdd/personal-onboarding.bdd.test.ts` |
| 团队 | 已落地 | **`examples/waves/team-handoff-min.json`**、[协作文档](./user-guide/zh/collaboration-async-handoff.md)、`test/bdd/team-wave-handoff.bdd.test.ts` |
| CI | 已落地（需远端点一次） | **`agent-farm-health-cron.yml`**（doctor + insights artifact + issue-on-fail）、**`npm run ci:health:local`**、`test/bdd/ci-health-local.bdd.test.ts`；请在 GitHub **Actions → Run workflow** 确认绿跑 |
| 发布 | **0.1.42** | **[CHANGELOG](../CHANGELOG.md)** `[0.1.42]`；`npm run test:bdd`、`ci-health-local` dist 兜底、`project init` 示例 wave + health workflow |
| 回归 | 已落地 | **`npm run test:bdd`**；主 **`ci.yml`** 含 BDD + `ci:health:local` |
| 发布执行 | 待维护者 | `npm publish`；合并后 **workflow_dispatch** |
