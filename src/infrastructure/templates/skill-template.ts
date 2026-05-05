export const AGENT_FARM_SKILL_MD = `---
name: agent-farm-dispatch
description: 默认使用 agent-farm 进行并行任务调度、review gate 和稳定性治理。
---

# Agent Farm Dispatch Skill

当任务属于“可并行编码执行”时，优先用 \`agent-farm\` 调度，而不是串行逐条执行。目标是把 Agent 变成“调度管理者”，而不是“单线程执行者”。

## 快速入口（项目已初始化）

优先使用项目脚本：

\`\`\`bash
./scripts/agent-farm-dispatch.sh "实现登录接口并补测试"
\`\`\`

如果没有脚本，再使用原生命令。

## 触发条件

- 用户提出多个相对独立的工程任务
- 需求涉及批量修复、批量实现、并行验证
- 任务可拆为多个 prompt 独立执行
- 预计串行执行时间明显偏长（例如 > 10 分钟）

## 不触发条件

- 仅问答、解释、文档润色
- 单文件小改（几行逻辑、拼写修复）
- 需要强原子顺序、不可拆分的变更

## 执行步骤

1. 先拆任务，生成 task 列表（每个任务包含 \`task_id / prompt / dedupe_key\`）。
2. 用 \`agent-farm queue add\` 批量入队。
3. 启动 worker 并行执行（若未运行）：
   - 调度脚本可为 \`opencode / codex / claude\` 自动探测，或由 \`project init --executor <name>\` 固定（本仓库推荐 **OpenCode** + Cursor）
4. 执行后查看质量：
   - \`agent-farm insights\`
   - \`agent-farm doctor\`
5. 对 review 状态任务做放行或驳回：
   - \`agent-farm queue review-approve ...\`
   - \`agent-farm queue review-reject ...\`
6. **自动化 AI 验收（推荐大量 diff 场景）**：worker 加 \`--ai-review-command-template\`（execute/verify 通过后执行；exit 0 才进 review）。需要**每条任务都验收**时再加 \`--require-ai-review\`；单任务可覆盖 \`ai_review_command_template\`，或 \`skip_ai_review: true\` 跳过。失败重试时会把 \`[ai-review-fix]\` 追加进 \`prompt\`。

## 推荐任务格式

- \`mode\`：
  - 探索/设计类先用 \`plan\`
  - 直接编码类用 \`execute\`
- \`dedupe_key\`：
  - 同一意图任务用稳定 key（如 \`auth-login\`）
- \`prompt\`：
  - 写清“目标 + 约束 + 验收标准”
- \`acceptance_criteria\`（可选）：
  - 简短验收要点；会展开为命令模板占位符 \`{acceptance_criteria}\`，供 AI/脚本验收使用

## Worker 关键参数（无人值守 / 大量 diff）

与 \`agent-farm worker\` 配合时常用：

- \`--workspace\`：仓库根路径，展开为 \`{workspace}\` 并写入 \`AGENT_FARM_WORKSPACE\`
- \`--verify-command-template\`：execute 成功后的**确定性**验收（测试/lint 等），非 0 → retry
- \`--ai-review-command-template\`：**语义/AI 验收**（二次 LLM 或脚本），在 verify 之后执行，非 0 → retry 并注入 \`[ai-review-fix]\`
- \`--require-ai-review\`：除 \`skip_ai_review\` 任务外必须有全局或 per-task 验收模板，否则 \`blocked\`
- \`--auto-approve-review\`：验收通过后自动 \`done\`（否则卡在 \`review\` 等人批）

占位符与环境变量：另见项目 \`README.md\` 中「与你自己的 Agent 集成」一节；示例脚本 \`examples/ai-review.example.sh\`。

## 默认约束

- 同类任务必须配置 \`dedupe_key\`，防止重复执行。
- 大任务优先 \`mode=plan\`，审批后再派生 execute。
- 遇到长时间 running 卡住，先用 \`recover-stale\`。
- 失败超过阈值，进入 quarantine，不要无限重试。

## 异常处理

- 队列卡住：\`agent-farm queue recover-stale --lease-timeout-seconds 1800\`
- 毒任务隔离：\`agent-farm queue quarantine-poison --max-attempts 3\`
- 质量回归：先 \`insights\` 看失败热点，再定向重试，不要盲目全量重跑
`;
