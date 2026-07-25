# Decision Arbitration Layer — Design Document

## 1. 问题陈述

### 现状
agent-farm-cli 为 agent 系统提供批量并行调度：wave 入队 → claim → worktree 隔离 → execute → verify → AI review → merge。目前管线中的"决策点"是固定的（acceptance check / AI review verdict），仅覆盖 task 粒度的 pass/fail 判定。

### 痛点
多 agent 并行开发时，每个 worker 在编码过程中会遇到大量**技术选择**（用什么存储方案？选哪个库？目录结构怎么组织？前端框架选什么？）。在原生 Claude Code / Codex 中，agent 要么自己做主（可能不一致），要么停下来问用户（打断并行节奏）。当 4+ 个 worker 同时跑时，这种"每个 worker 都来问老板"的模式不可扩展。

### 目标
agent-farm-cli 升级为**中央决策仲裁层**：
- Worker 遇到技术选择时，通过 MCP 工具上报决策请求
- Farm 的 DecisionEngine 根据规则库、历史决策、项目上下文自动裁决
- 只在置信度不足时升级给用户
- 决策被记录为可审计的历史，供后续相似场景复用

---

## 2. 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    agent-farm-cli                        │
│                                                         │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │  MCP Server  │   │ Control Plane│   │  CLI (decision│ │
│  │  (stdio)     │   │   (HTTP)     │   │   list/resolve│ │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘ │
│         │                  │                   │         │
│         └──────────────────┼───────────────────┘         │
│                            │                             │
│                   ┌────────▼────────┐                    │
│                   │ DecisionService │  (facade)          │
│                   └────────┬────────┘                    │
│                            │                             │
│              ┌─────────────┼─────────────┐               │
│              │             │             │               │
│     ┌────────▼───┐ ┌──────▼──────┐ ┌───▼──────────┐    │
│     │Request     │ │Resolve      │ │List          │    │
│     │Decision    │ │Escalation   │ │Decisions     │    │
│     │UseCase     │ │UseCase      │ │UseCase       │    │
│     └────────┬───┘ └──────┬──────┘ └──────────────┘    │
│              │             │                             │
│              └──────┬──────┘                             │
│                     │                                    │
│            ┌────────▼────────┐                           │
│            │ DecisionEngine  │                           │
│            │                 │                           │
│            │ 1. Rule Match   │                           │
│            │ 2. History      │                           │
│            │ 3. [LLM]        │                           │
│            │ 4. Escalate     │                           │
│            └────────┬────────┘                           │
│                     │                                    │
│            ┌────────▼────────┐                           │
│            │ DecisionRepo    │  (SQLite)                 │
│            │ + TaskRepo      │                           │
│            │ + EventRepo     │                           │
│            └─────────────────┘                           │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Worker Pipeline (process-claimed-task)          │   │
│  │                                                  │   │
│  │  claim → worktree → execute → verify             │   │
│  │     → [decision gate] → ai-review → done         │   │
│  │                                                  │   │
│  │  The decision gate checks if the task entered    │   │
│  │  awaiting_decision (via MCP bridge during exec). │   │
│  │  If so, release worker; task retries when        │   │
│  │  decision is resolved.                           │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 决策流程

```
Worker (Claude Code subprocess)
  │
  │  遇到技术选择: "需要持久化浏览器数据，选什么存储方案？"
  │  调用 MCP tool: farm_request_decision({
  │    task_id: "poc001-qa",
  │    decision_id: "d_001",
  │    context: "Need to persist paper annotation data in browser...",
  │    options: ["IndexedDB", "SQLite(WASM)", "localStorage"],
  │    recommendation: "IndexedDB",
  │    stage: "execute",
  │    attempt: 1
  │  })
  │
  ▼
DecisionEngine.evaluate()
  │
  │  Step 1: Rule match
  │  ─────────────────
  │  遍历规则库（按 priority 降序）:
  │    rule-001: context_patterns=["数据库|存储|persist|storage"]
  │              preferred_option="SQLite"
  │              priority=100
  │    → 命中 "persist" + "storage" → 置信度 1.0 ≥ 0.85 → 自动裁决
  │
  │  Step 2: History match (规则未命中时)
  │  ─────────────────
  │  fingerprintContext(context, options) → "persist_paper_annotation_data_browser"
  │  findSimilar(task_id, fingerprint, minSimilarity=0.7)
  │    → 历史 #42: 同样选了 IndexedDB, 相似度 0.82
  │    → 0.82 < 0.85 → 不足 → 继续
  │
  │  Step 3: LLM resolve (future)
  │  ─────────────────
  │  [待实现] 将 project-level context (CLAUDE.md, tech-spec, package.json)
  │  注入 LLM prompt → 裁决 → 返回
  │
  │  Step 4: Escalate
  │  ─────────────────
  │  返回 { escalated: true, escalation_id: "esc_xxx" }
  │
  ▼
返回给 worker → task running → awaiting_decision (worker 释放)
  │
  │  用户在 dashboard/CLI 看到升级:
  │  $ agent-farm decision list
  │  ┌──────────────────────────────────────────────────────┐
  │  │ esc_001 | poc001-qa | "选择浏览器存储方案"           │
  │  │ Options: IndexedDB / SQLite(WASM) / localStorage    │
  │  │ Worker recommends: IndexedDB                        │
  │  │ Reason: No matching rules or historical precedent   │
  │  └──────────────────────────────────────────────────────┘
  │
  │  用户裁决:
  │  $ agent-farm decision resolve esc_001 --choice IndexedDB \
  │      --reason "POC 优先用平台原生 API，和 CLAUDE.md 一致。" --reset-task
  │
  ▼
task awaiting_decision → retry (prompt 注入 decision context)
  → worker 重新 claim → 继续执行（agent 知道选择是 IndexedDB）
```

---

## 3. 领域模型

### 3.1 新增任务状态: `awaiting_decision`

在 `TASK_STATUSES` 数组中插入（位于 `approved` 之后，`rejected` 之前）:

```typescript
"awaiting_decision"  // 决策升级中，等待人工裁决；worker 已释放
```

状态转换:
```
running            → awaiting_decision  // MCP bridge 检测到升级
awaiting_decision  → retry              // 用户解决，任务重试
awaiting_decision  → failed             // 决策超时或拒绝
awaiting_decision  → queued             // 重新入队
awaiting_decision  → blocked            // 决策无法解决
```

属于 `ACTIVE_STATUSES`（任务仍活跃，面板可见）。

### 3.2 决策请求/响应类型

```typescript
// Worker → Farm
type DecisionRequest = {
  task_id: string;
  decision_id: string;         // worker 生成的 UUID
  context: string;             // 自然语言描述
  options: string[];           // 候选方案
  recommendation?: string;     // worker 推荐
  stage: "execute" | "verify" | "ai_review";
  attempt: number;
};

// Farm → Worker（两种结果）
type DecisionResult =
  | {                         // 自动裁决成功
      decision_id: string;
      chosen: string;
      reason: string;
      resolved_by: "rule" | "history" | "llm";
      confidence: number;
      escalated: false;
    }
  | {                         // 升级给人工
      decision_id: string;
      escalated: true;
      escalation_id: string;
      reason: string;
    };

// 持久化的历史记录
type DecisionRecord = {
  id: string;
  task_id: string;
  decision_id: string;
  context: string;
  context_fingerprint: string;  // 归一化 hash, 用于相似度搜索
  options: string[];
  chosen: string | null;
  reason: string;
  resolved_by: "rule" | "history" | "llm" | "human" | null;
  confidence: number | null;
  status: "resolved" | "escalated" | "pending" | "rejected" | "timed_out";
  created_at: string;
  resolved_at?: string;
};
```

### 3.3 决策规则

```typescript
type DecisionRule = {
  id: string;
  description: string;
  context_patterns: string[];    // 子串匹配（大小写不敏感）
  option_patterns?: string[];    // 可选: 匹配 option 名的模式
  preferred_option?: string;     // 优先选这个 option
  default_choice?: string;       // 固定答案
  priority?: number;             // 越高越先评估
};
```

规则存储在 `.agent-farm/config.json` 的 `decision.rules` 段，可版本控制:
```json
{
  "decision": {
    "enabled": true,
    "auto_threshold": 0.85,
    "rules": [
      {
        "id": "storage-default",
        "description": "数据持久化默认用 SQLite",
        "context_patterns": ["数据库", "存储", "database", "storage", "persist"],
        "preferred_option": "SQLite",
        "priority": 100
      },
      {
        "id": "frontend-react",
        "description": "前端框架统一用 React",
        "context_patterns": ["前端", "UI", "frontend", "framework"],
        "option_patterns": ["React", "react", "Preact"],
        "preferred_option": "React",
        "priority": 100
      }
    ]
  }
}
```

---

## 4. DecisionEngine 实现

### 4.1 规则匹配算法

```typescript
function matchRules(request: DecisionRequest, rules: DecisionRule[]): DecisionResult | null {
  const sorted = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const ctx = request.context.toLowerCase();

  for (const rule of sorted) {
    // 检查 context_patterns 是否有子串命中
    const matchedPatterns = rule.context_patterns.filter(p =>
      ctx.includes(p.toLowerCase())
    );

    if (matchedPatterns.length === 0) continue;

    // 置信度 = 命中 pattern 数 / 总 pattern 数
    let confidence = matchedPatterns.length / rule.context_patterns.length;

    // 如果 rule 有 option_patterns，检查 option 是否匹配
    if (rule.option_patterns && rule.option_patterns.length > 0) {
      const optMatched = request.options.some(opt =>
        rule.option_patterns!.some(p => opt.toLowerCase().includes(p.toLowerCase()))
      );
      if (!optMatched) continue;  // option 不匹配，规则不适用
      confidence = Math.min(1, confidence + 0.1);  // option 匹配加分
    }

    // 确定 chosen option
    let chosen: string;
    if (rule.default_choice) {
      chosen = rule.default_choice;
    } else if (rule.preferred_option) {
      // 从 request.options 中找大小写不敏感的匹配
      const found = request.options.find(
        o => o.toLowerCase() === rule.preferred_option!.toLowerCase()
      );
      if (!found) continue;  // preferred_option 不在候选列表中
      chosen = found;
    } else {
      chosen = request.recommendation ?? request.options[0]!;
    }

    return {
      decision_id: request.decision_id,
      chosen,
      reason: `Rule "${rule.id}" matched: ${rule.description}. (patterns: ${matchedPatterns.join(", ")})`,
      resolved_by: "rule",
      confidence,
      escalated: false,
    };
  }

  return null;  // 无规则匹配
}
```

### 4.2 历史相似度匹配

使用 Jaccard 相似度比较 tokenized fingerprint:

```typescript
function fingerprintContext(context: string, options: string[]): string[] {
  const text = (context + " " + options.join(" ")).toLowerCase();
  return text
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2)  // 过滤太短的 token
    .sort();
}

function fingerprintSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;  // Jaccard
}
```

历史匹配在 DecisionEngine 中:
```typescript
async matchHistory(request: DecisionRequest): Promise<DecisionResult | null> {
  const fp = fingerprintContext(request.context, request.options);
  const similar = await this.decisionRepo.findSimilar(
    request.task_id,
    fp.join(" "),  // 存为空格分隔字符串
    0.7             // minSimilarity
  );
  if (similar.length === 0) return null;

  const best = similar[0]!;
  return {
    decision_id: request.decision_id,
    chosen: best.chosen!,
    reason: `Similar to historical decision #${best.id} (${(best._similarity * 100).toFixed(0)}% match): ${best.reason}`,
    resolved_by: "history",
    confidence: best._similarity,
    escalated: false,
  };
}
```

---

## 5. 集成点

### 5.1 MCP Bridge（主通道）

Worker 的 shell template 配置 Claude Code 连接 farm MCP:
```bash
claude --prompt {prompt} \
  --mcp-config '{"agent-farm":{"command":"node","args":["dist/interfaces/mcp/server.js"]}}' \
  --output-format stream-json
```

Claude Code 在遇到决策点时调用 `farm_request_decision` MCP tool → farm DecisionEngine 评估 → 返回裁决。

当返回 `escalated: true` 时:
1. MCP server 调用 `DecisionService.requestDecision()` → use case 把 task 转为 `awaiting_decision`
2. Worker 的 stream observer 检测到 `[farm-escalated]` 标记或输出中的 escalation marker
3. Worker 释放该 task（心跳停止），claim 下一个

### 5.2 Worker Pipeline Gate（辅通道）

`stage-awaiting-decision.ts` 在所有 stage 之后检查 task 是否被 MCP bridge 转入了 `awaiting_decision`:

```typescript
export async function runAwaitingDecisionStage(
  ctx: ClaimedTaskShellContext,
  opts: { decisionEngineEnabled: boolean }
): Promise<AwaitingDecisionStageResult> {
  if (!opts.decisionEngineEnabled) return { kind: "ok" };

  // 检查 task 当前状态（MCP bridge 可能已改为 awaiting_decision）
  // 通过 event repo 查询 task_awaiting_decision 事件
  const task = ctx.task;
  if (task.status === "awaiting_decision") {
    return {
      kind: "awaiting_decision",
      escalation_id: String(task._escalation_id ?? ""),
    };
  }

  return { kind: "ok" };
}
```

### 5.3 决策解决后重试

`ResolveEscalationUseCase` 将决策上下文注入 task prompt:
```typescript
const decisionCtx = `
[decision-resolved]
Decision "${escalationId}" resolved by ${resolved_by}:
  Chosen: ${choice}
  Reason: ${reason}

Continue your work with this decision. Do not reconsider this choice.
`;

const newPrompt = `${basePromptForRetry(task.prompt)}\n\n${decisionCtx}`;

await taskRepo.mergeOneTask(taskId, (t) => ({
  ...t,
  status: "retry",
  prompt: newPrompt,
  attempt: (Number(t.attempt ?? 0) + 1),
  _decision_id: escalationId,
}));
```

---

## 6. 配置示例

完整的 `.agent-farm/config.json`:
```json
{
  "empty_run": { "enabled": true },
  "executor": { "id": "opencode" },
  "decision": {
    "enabled": true,
    "auto_threshold": 0.85,
    "rules": [
      {
        "id": "storage-sqlite",
        "description": "数据持久化统一使用 SQLite (better-sqlite3)",
        "context_patterns": ["数据库", "存储", "persist", "database", "storage"],
        "preferred_option": "SQLite",
        "priority": 100
      },
      {
        "id": "frontend-react",
        "description": "前端框架统一使用 React + TypeScript",
        "context_patterns": ["前端", "UI", "界面", "frontend", "framework", "component"],
        "option_patterns": ["React", "react"],
        "preferred_option": "React",
        "priority": 100
      },
      {
        "id": "state-zustand",
        "description": "状态管理用 Zustand (轻量、TS 友好)",
        "context_patterns": ["状态管理", "state management", "store"],
        "preferred_option": "Zustand",
        "priority": 90
      },
      {
        "id": "testing-vitest",
        "description": "测试框架统一用 Vitest",
        "context_patterns": ["测试", "test", "testing", "unit test"],
        "preferred_option": "Vitest",
        "priority": 90
      }
    ]
  }
}
```

---

## 7. MCP 工具规格

### `farm_request_decision`
- **描述**: Worker 上报决策请求。Farm 自动裁决或升级。
- **输入 Zod schema**:
  ```typescript
  {
    task_id: z.string().min(1),
    decision_id: z.string().min(1),
    context: z.string().min(1),
    options: z.array(z.string()).min(1),
    recommendation: z.string().optional(),
    stage: z.enum(["execute", "verify", "ai_review"]),
    attempt: z.number().int().min(0),
  }
  ```
- **输出**: `DecisionResult` (JSON)

### `farm_list_escalations`
- **描述**: 列出所有待人工裁决的升级决策。
- **输入 Zod schema**:
  ```typescript
  {
    task_id: z.string().optional(),  // 可选: 按 task 过滤
  }
  ```
- **输出**: `DecisionRecord[]`

### `farm_resolve_escalation`
- **描述**: 解决升级决策，可选重置 task 为 retry。
- **输入 Zod schema**:
  ```typescript
  {
    escalation_id: z.string().min(1),
    choice: z.string().min(1),
    reason: z.string().min(1),
    reset_task: z.boolean().optional().default(true),
  }
  ```
- **输出**: `{ decision: DecisionRecord; task?: TaskRecord }`

---

## 8. CLI 命令

```bash
# 列出所有待裁决的升级
agent-farm decision list
agent-farm decision list --task poc001-qa

# 解决一个升级
agent-farm decision resolve esc_20260705_001 \
  --choice "IndexedDB" \
  --reason "POC 优先用平台原生 API，与 CLAUDE.md 一致。"

# 解决但不重置 task（仅记录决策）
agent-farm decision resolve esc_20260705_001 \
  --choice "IndexedDB" \
  --reason "..." \
  --no-retry
```

---

## 9. 未来扩展

| 方向 | 描述 | 优先级 |
|------|------|--------|
| LLM Resolver | 规则/历史均未命中时，用 LLM + project context 裁决 | P1 |
| 决策看板面板 | dashboard TUI 中显示待裁决数量和列表 | P2 |
| 决策预览 | worker 上报后，在 control plane 实时显示决策请求 | P2 |
| 向量相似度 | 替换 Jaccard 为 embedding cosine similarity | P3 |
| 决策模板 | 常见决策预定义模板（技术栈选择、架构模式等） | P3 |
| 决策审计报告 | `agent-farm decision report` 生成决策统计 | P4 |

---

## 10. 风险与缓解

| 风险 | 缓解 |
|------|------|
| MCP bridge 延迟导致 worker 等待 | 规则匹配 < 1ms；历史匹配 < 10ms；LLM resolver 可异步 |
| 规则库维护成本 | 规则存 config.json 可版本控制；规则越少越好（守门不是 micromanage） |
| 误裁决导致 agent 走错方向 | confidence threshold 可调；历史决策可标记 rejected |
| awaiting_decision 任务堆积 | stale recovery 覆盖 awaiting_decision；CLI panel 提供可见性 |
