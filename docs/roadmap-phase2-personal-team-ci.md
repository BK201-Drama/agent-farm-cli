# 第二轮攻关：个人 → 团队 → CI（拓展 40 项）

> 第一轮（0.1.42，PR #2 已合并）完成文档、BDD、`ci:health:local`、`project init` 默认产物。本文为 **Phase 2** 任务索引；执行顺序仍遵循 **BDD → TDD**，不改 `domain` / `application` 边界。

## 任务总表（V01–V40）

| ID | 任务 | 类型 | 目标状态 |
|----|------|------|----------|
| V01 | `roadmap-phase2` 索引（本文件） | 文档 | ✅ |
| V02 | `npm run farm:doctor:ci` | 脚本 | ✅ |
| V03 | BDD `project-init-defaults` | 测试 | ✅ |
| V04 | BDD `personal-team-ci-chain` | 测试 | ✅ |
| V05 | 单测 `examples` wave 必填字段 | 测试 | ✅ |
| V06 | 单测 `package.json` `files` 含 `examples` | 测试 | ✅ |
| V07 | README 最短路径补 demo / `--ci-exit` | 文档 | ✅ |
| V08 | 主 roadmap：PR #2 已合并 | 文档 | ✅ |
| V09 | consumer health workflow YAML 注释 | 模板 | ✅ |
| V10 | `contributing-pr` 合并后节 | 文档 | ✅ |
| V11 | `harness-contracts` 链本文件 | 文档 | ✅ |
| V12 | `AGENTS.md` 链 Phase 2 | 文档 | ✅ |
| V13 | CLI 单测 `project init --skip-*` | 测试 | ✅ |
| V14 | `test/bdd/README` 更新 | 文档 | ✅ |
| V15 | user-guide 索引链 Phase 2 | 文档 | ✅ |
| V16 | 本文件英文摘要段 | 文档 | ✅ |
| V17 | integrations：合并后 cron 说明 | 文档 | ✅ |
| V18 | `scripts/validate-example-waves.mjs` | 脚本 | ✅ |
| V19 | `npm run validate:waves` | 脚本 | ✅ |
| V20 | 主 `ci.yml` 跑 `validate:waves` | CI | ✅ |
| V21 | BDD `demo task --template check` 冒烟 | 测试 | ✅ |
| V22 | install 5 分钟链 `farm:doctor:ci` | 文档 | ✅ |
| V23 | faq 发布前检查清单 | 文档 | ✅ |
| V24 | `pr-body` 标注已合并 | 文档 | ✅ |
| V25 | `init-project` 单测 skip 标志 | 测试 | ✅ |
| V26 | `examples` vs `test/fixtures` wave 说明 | 文档 | ✅ |
| V27 | vitest BDD `testTimeout` | 配置 | ✅ |
| V28 | integrations `doctor --ci-exit` 规则表 | 文档 | ✅ |
| V29 | integrations 链 `validate:waves` | 文档 | ✅ |
| V30 | `examples/waves/README` 校验命令 | 文档 | ✅ |
| V31 | CHANGELOG `[Unreleased]` 0.1.43 | 发布 | ✅ |
| V32 | 版本 **0.1.43**（本批） | 发布 | ✅ |
| V33 | `check` + `test` + `test:bdd` + `validate:waves` | 验证 | ✅ |
| V34 | 分支 `feat/roadmap-phase2-v2` PR | 流程 | 待 PR |
| V35 | npm publish **0.1.42**（若尚未） | 维护者 | 待你 |
| V36 | health cron 远端绿跑 | 维护者 | 待你 |
| V37 | `@slow` E2E wave→dispatch | 测试 | 可选 |
| V38 | matrix 第二 workspace | CI | 可选 |
| V39 | consumer workflow 完整 issue 步骤 | 模板 | 可选 |
| V40 | `gh` PR 自动化 | 工具 | 可选 |

## English summary

Phase 2 hardens the **personal → team → CI** path after PR #2: `farm:doctor:ci`, wave validation script, chained BDD, `project init` BDD, and CI running `validate:waves`. Optional items (V37–V40) stay out of the default release train.

→ 第一轮：[roadmap-one-week-personal-team-ci.md](./roadmap-one-week-personal-team-ci.md)
