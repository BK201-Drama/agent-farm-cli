# BDD → TDD（本仓库约定）

## 顺序

1. **BDD（行为）**：在 `test/bdd/*.bdd.test.ts` 用 `describe`/`it` 写**用户可理解**的场景，推荐在 `it` 上方用注释写 **Given / When / Then**。此时测试应**失败**（红），直到下层实现补齐。
2. **TDD（实现）**：仅在 `scripts/`、`examples/`、`docs/`、`.github/workflows/` 或**已有** CLI 注册中做**最小**改动使场景变绿；**不**为通过测试而破坏 `src/domain`、`src/application` 的分层边界。
3. **回归**：每次合并前跑 `npm run check && npm test && npm run test:bdd && npm run validate:waves && npm run validate:waves:strict:examples`。

## 与 `test/cli/` 的分工

| 目录 | 侧重 |
|------|------|
| **`test/bdd/`** | 产品叙事：**个人 5 分钟**、**团队 wave 交接**、**CI 本地 parity**、**project init 默认产物**、**personal→CI 链** |
| **`test/cli/`** | CLI 集成细节、边界参数、服务层冒烟 |

避免两处断言完全重复：BDD 保留「用户可见」结果；细粒度规则放在 `test/cli/` 或 `test/cli/doctor-ci-guards.test.ts`。

## 命名与过滤

- 文件后缀 **`.bdd.test.ts`**
- 只跑 BDD：`npm run test:bdd` 或 `npx vitest run test/bdd`
- 全局超时见根目录 **`vitest.config.ts`**（`testTimeout: 30_000`）

## 场景索引

| 文件 | 叙事 |
|------|------|
| `personal-onboarding.bdd.test.ts` | demo、doctor --ci-exit、不健康队列、queue list、demo check |
| `team-wave-handoff.bdd.test.ts` | 官方 `examples/waves/team-handoff-min.json` 契约与 enqueue |
| `ci-health-local.bdd.test.ts` | `npm run ci:health:local` 与 CI 精神对齐 |
| `project-init-defaults.bdd.test.ts` | `project init` 默认 wave + health yml；`--skip-*` |
| `personal-team-ci-chain.bdd.test.ts` | 顺序：demo → doctor --ci-exit → ci-health-local |

第二轮任务表：**[`docs/roadmap-phase2-personal-team-ci.md`](../../docs/roadmap-phase2-personal-team-ci.md)**
