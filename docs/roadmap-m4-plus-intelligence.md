# M4+：智能增强 — 从并行调度到智能编排

> 父文档：[`roadmap-big-vision-3m.md`](./roadmap-big-vision-3m.md)
> 前序里程碑：M1（Cursor 控制面）→ M2（流水线契约 + 团队可复制）→ M3（陌生人产品化）
> 本阶段：在稳定地基上叠加**四个智能化增量**，让 agent-farm 从"任务调度工具"进化为"AI 开发智能层"。

## 一句话定位

**M1-M3 让 agent-farm "能跑"；M4 让 agent-farm "能思考"——自动选模型、自动拆任务、自动分类型、自动积累经验。**

---

## 方向 1：多模型路由（Multi-Model Routing）

### 问题

当前所有任务用同一 executor + 同一模型。但真实场景中：
- 简单重构（批量改名、格式修正）用便宜模型即可，浪费算力
- 复杂架构决策需要强模型，不能省
- 涉及敏感数据的任务需要本地模型

### 目标

**任务级模型选择 + 成本可观测**，让用户按任务重要性和敏感度路由到不同模型。

### 交付

| ID | 交付 | 说明 |
|----|------|------|
| m4-model-field-schema | Wave 新增 `model` 字段 + schema 校验 | `{ "model": "claude-opus" }` 写入任务，validate:waves 识别 |
| m4-model-resolve | Executor 层模型解析器 | 从 env / config.json / 任务级 三级优先级解析最终 model |
| m4-model-executor-pass | executor 适配 model 参数 | cursor-sdk / opencode / shell-template 三类 executor 各自接 model |
| m4-model-dashboard | dashboard 显示每任务 model + 预估成本 | 看板新增 model 列；基于 token 用量粗略估算 |
| m4-model-doc | 用户文档 + playbook | 多模型路由配置指南 + 最佳实践 |

### 验收

- Wave 里写 `"model": "gpt-4o-mini"`，worker 按指定模型执行
- dashboard 可见每任务使用的模型
- `npm run validate:waves:strict` 可校验 model 字段合法性

---

## 方向 2：智能拆波（Auto-Wave from Requirements）

### 问题

现在用户需要手动写 wave JSON。门槛高、效率低。真实需求是：**"给我实现登录模块" → 自动拆成 plan + execute wave → 自动入队**。

### 目标

**自然语言需求 → AI 拆解 → wave JSON → 入队 → 执行 → 提 PR**，整条链路自动化。

### 交付

| ID | 交付 | 说明 |
|----|------|------|
| m4-decompose-service | `DecomposeService`：需求拆解核心 | 输入自然语言 → 输出 WaveItem[]（plan + execute 派生） |
| m4-decompose-cli | CLI `decompose` 子命令 | `agent-farm decompose "实现 RBAC 权限系统"` → 输出 wave JSON |
| m4-decompose-mcp | MCP 工具 `farm_decompose` | Cursor 对话内直接拆任务 |
| m4-decompose-gh-issue | GitHub Issue → Wave 适配器 | 从 issue 标题+正文拆 wave（可选 Linear / Jira） |
| m4-decompose-pr-create | Wave 完成后自动创建 PR | 所有任务 done → 汇总 diff → `gh pr create` |
| m4-decompose-doc | 用户文档 | 拆解策略说明 + 示例 |

### 验收

- `agent-farm decompose "实现用户登录 + 注册"` 输出合法 wave JSON
- `npm run validate:waves` 校验通过，可直接 `farm:wave` 入队
- demo 录屏：自然语言 → wave → 入队 → worker 执行 → 自动 PR

---

## 方向 3：AI 算力调度层（Task-Type Router）

### 问题

现在 agent-farm 把所有任务当成"写代码"。但实际场景中 AI 可做的事远不止这个——文档、测试、审查、迁移、国际化……

不同类型的任务应该有不同的路由策略：
- 代码生成 → Cursor SDK / OpenCode
- 文档生成 → 轻量模型 + 模板约束
- 测试生成 → 强模型 + 严格验收
- 代码审查 → 只读模式 + diff 上下文

### 目标

**按任务类型自动选择 executor + model + 验收策略**，让 agent-farm 成为通用的"AI 任务路由器"。

### 交付

| ID | 交付 | 说明 |
|----|------|------|
| m4-task-type-schema | Wave 新增 `task_type` 字段 | 枚举：`code_gen`, `doc_gen`, `test_gen`, `code_review`, `migration`, `i18n`, `refactor` |
| m4-type-router | `TaskTypeRouter`：类型 → executor/model/verify 映射 | 默认策略 + 用户可覆盖 |
| m4-type-template | 每种 task_type 内置 prompt 模板 | 减少用户写 prompt 的负担 |
| m4-type-dashboard | dashboard 按 task_type 分类统计 | 各类型成功率、耗时、成本 |
| m4-type-doc | 用户文档 | 任务类型说明 + 自定义路由规则 |

### 验收

- Wave 里设 `"task_type": "doc_gen"`，自动路由到轻量模型 + 文档生成模板
- dashboard 显示按类型分类的统计
- 用户可自定义类型路由规则（`.agent-farm/config.json` → `task_types`）

---

## 方向 4：Agent 知识库（Cross-Task Learning）

### 问题

现在每个 agent 任务是信息孤岛——任务 A 做完了，任务 B 完全不知道 A 做了什么。
应该让后续任务能**自动继承前面任务的经验和上下文**。

### 目标

**跨任务知识积累 + 自动上下文注入**，让 agent-farm 越用越聪明。

### 交付

| ID | 交付 | 说明 |
|----|------|------|
| m4-exec-record | `ExecutionRecord` 存储层 | 每条任务完成时记录：prompt、model、exit_code、diff_summary、duration |
| m4-pattern-store | 成功/失败模式存储 + 查询 | 按 dedupe_key 前缀聚类，识别高频失败模式 |
| m4-context-inject | 跨任务上下文注入器 | 任务 B 入队时，自动注入同 wave 已完成任务的 diff 摘要 |
| m4-pattern-alert | 失败模式预警 | 入队前检查是否命中已知失败模式，给出警告 |
| m4-knowledge-dashboard | dashboard 知识库视图 | 成功率趋势、高频失败类型、最佳 executor/model 推荐 |
| m4-knowledge-doc | 用户文档 | 知识库使用指南 + 隐私说明 |

### 验收

- wave 拆 3 条任务，第 2、3 条的 prompt 自动附加第 1 条的 diff 摘要
- 连续 3 次同类任务失败后，第 4 次入队前收到警告
- `agent-farm insights` 可查看失败模式分析

---

## 分期建议

四个方向可并行开发，但建议按依赖关系分期：

| 阶段 | 内容 | 理由 |
|------|------|------|
| **M4a**（2-3 周） | 方向 1（多模型路由）+ 方向 3（任务类型路由） | 两者共享 model 选择和 executor 路由逻辑，合在一起做效率高 |
| **M4b**（2-3 周） | 方向 2（智能拆波） | 依赖方向 1 的 model 字段和方向 3 的 task_type 字段构建 wave |
| **M4c**（2-3 周） | 方向 4（Agent 知识库） | 依赖前三个方向产生足够的历史数据来训练模式识别 |

---

## 与现有架构的关系

- 不重写 worker 主路径，通过 **executor 适配器层**注入 model 参数
- 不改变队列/lease/review gate 核心逻辑，在其上叠加**智能层**
- 复用现有 `public-api.ts` 的 facade 模式，新增的 Service 统一 export
- 知识库存储**复用 SQLite**（与队列同库不同表）

## 非目标（M4 不做）

- 不实现模型 API 计费系统（仅粗略估算）
- 不实现外部知识库服务 / vector DB
- 不做多租户知识库隔离
- 不做 issue/webhook 的实时监听（仅 CLI 主动调用）
