# 自迭代 wave 写作规范

## `dedupe_key` 命名

- **与 `task_id` 一致**：绝大多数场景下 `dedupe_key` 等于 `task_id`，形成 1:1 防重。
- **格式**：`<区域或迭代>-<日期>-<简述>`，全部 **kebab-case**（小写连字符），如 `meta-self-iter-20260510-agents-wave-authoring`、`polish-20260510b-doctor-brief-storage`。
- **稳定性**：同一意图的任务使用相同的 `dedupe_key`，防止同一项被重复入队。重复时 worker 会标记 `blocked`（原因：`task_deduped_blocked`）。
- **不能为空**：入队脚本 (`enqueue-task-wave.mjs`) 会拒绝 `dedupe_key` 为空或缺失的任务。

## 验收命令写进 `prompt`

- **prompt 末尾必须写验收命令**，格式：`验收：\`npm run check && npm test\` 必须通过`，让 worker 在执行前就明确验收标准。
- **`acceptance_criteria` 字段** 作为补充（可选），在 verify/ai-review 阶段展开为模板占位符 `{acceptance_criteria}`，供 AI 或验收脚本使用。
- **prompt 开头标注仓库根**，如 `仓库根：agent-farm-cli。`，帮助 worker 定位项目上下文。
- **verify 必跑**：每条任务模板须挂 verify 命令（默认模板已内置），禁止跳过确定性验收。

## 建议 task 粒度

- **小 wave**：每次发 **1~3 条**任务，跑通再追加。大量任务堆积时排查困难。
- **单任务聚焦一个目标**：避免「既改 A 又重构 B」的混合任务。一个 task 对应一个可验证的变更。
- **plan 与 execute 分离**：
  - `mode: "plan"`：分析、设计、输出方案，**不写代码**。`priority` 建议 0~1。
  - `mode: "execute"`：实现、修复、重构，写代码并**通过验收**。`priority` 建议 2~3。
  - plan 先于 execute：先让 plan 任务跑出设计结论，再按其输出落 execute。
- **priority 排序**：3 = 紧急, 2 = 重要, 1 = 低优, 0 = 后台。
- **先 pull 再 wave**：发波前 `git pull` 确保 HEAD 最新，减少 worktree 从旧 commit 分岔产生的合并冲突。

## 验收

- 单个 task 验收：prompt 内写验收命令，worker 执行后 verify 阶段自动校验。
- 整波验收：所有任务 `done` 后，运行 `agent-farm doctor` 确认无重复 `dedupe_key`、无积压异常。
- 出现 `task_merge_failed` 时按 **README** 自动合并排错步骤处理：脏区冲突先 `git stash pop`，真冲突 `git merge --abort` 后手动合入，再 `queue update` 标记 done。

## Prompt 质量与校验

- 写作清单与模板：**[wave-prompt-playbook.md](./wave-prompt-playbook.md)**；可复制 **`examples/waves/templates/`** 下 `plan-prompt.template.md` / `execute-prompt.template.md`。
- 标准 plan→execute 样例：**`examples/waves/plan-execute-feature.json`**。
- 入队前校验：`enqueue-task-wave.mjs` 与 `queue add --task-json` 共用 **`scripts/lib/wave-validate.mjs`**。
- 本地校验：`npm run validate:waves`（`examples/waves` + `.agent-farm/waves`，跳过 `_*.json`）；严格模式 `npm run validate:waves:strict`。
- 历史 wave 补 `acceptance_criteria`：`npm run migrate:waves:acceptance`（从 prompt「验收：」推断）。
- execute 建议：`read_paths` 字段 + prompt 内「先 Read …」+「禁止长时间无 git diff」。

→ 上一层：[dispatch-and-environment.md](./dispatch-and-environment.md)；队列边界：[queue-database-rules.md](./queue-database-rules.md)
