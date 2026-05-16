# BDD → TDD（本仓库约定）

## 顺序

1. **BDD（行为）**：在 `test/bdd/*.bdd.test.ts` 用 `describe`/`it` 写**用户可理解**的场景，推荐在 `it` 上方用注释写 **Given / When / Then**。此时测试应**失败**（红），直到下层实现补齐。
2. **TDD（实现）**：仅在 `scripts/`、`examples/`、`docs/`、`.github/workflows/` 或**已有** CLI 注册中做**最小**改动使场景变绿；**不**为通过测试而破坏 `src/domain`、`src/application` 的分层边界。
3. **回归**：每次合并前跑 `npm run check && npm test`。

## 与「集成测试」目录的关系

- `test/cli/*`：偏命令行与服务的集成/冒烟。
- **`test/bdd/`**：偏**产品叙事**与「个人 / 团队 / CI」可复制路径；可调用 `spawn`，但应**短、稳、可本地无密钥运行**。

## 命名

- 文件后缀 **`.bdd.test.ts`**：便于过滤：`npx vitest run test/bdd`。
