# Decision Arbitration Layer — Technical Specification

> 实施规范。与 `decision-arbitration-layer.md`（设计文档）配对阅读。

## 文件清单

### Create (19 files)

| # | File | Phase | Description |
|---|------|-------|-------------|
| 1 | `src/domain/decision/model.ts` | 1 | DecisionRequest, DecisionResult, DecisionRecord, DecisionRule, DecisionEnginePort |
| 2 | `src/domain/decision/fingerprint.ts` | 1 | `fingerprintContext()`, `fingerprintSimilarity()` |
| 3 | `src/domain/decision/rules.ts` | 1 | `matchRules()`, `calculateRuleConfidence()` |
| 4 | `src/application/contracts/decision-repository.ts` | 3 | DecisionRepository port interface |
| 5 | `src/application/engines/decision-engine.ts` | 2 | DecisionEngine class |
| 6 | `src/application/use-cases/decision/request-decision.ts` | 4 | RequestDecisionUseCase |
| 7 | `src/application/use-cases/decision/resolve-escalation.ts` | 4 | ResolveEscalationUseCase |
| 8 | `src/application/use-cases/decision/list-decisions.ts` | 4 | ListDecisionsUseCase |
| 9 | `src/application/facades/decision-service.ts` | 5 | DecisionService facade |
| 10 | `src/application/worker/process-claimed-task/stage-awaiting-decision.ts` | 7 | Decision gate stage |
| 11 | `src/infrastructure/persistence/sqlite/decisions.ts` | 3 | SqliteDecisionRepository |
| 12 | `src/infrastructure/persistence/jsonl/decisions.ts` | 3b | JsonlDecisionRepository (optional) |
| 13 | `src/infrastructure/config/decision-rules-loader.ts` | 5 | Load rules from project config |
| 14 | `src/interfaces/cli/register/decision.ts` | 8 | CLI decision command group |
| 15 | `test/domain/decision/fingerprint.test.ts` | 9 | Fingerprint unit tests |
| 16 | `test/domain/decision/rules.test.ts` | 9 | Rule matching unit tests |
| 17 | `test/application/decision-engine.test.ts` | 9 | Engine integration tests |
| 18 | `test/application/request-decision.test.ts` | 9 | Request decision use case tests |
| 19 | `test/application/resolve-escalation.test.ts` | 9 | Resolve escalation use case tests |

### Modify (15 files)

| # | File | Phase | Change |
|---|------|-------|--------|
| 1 | `src/domain/task/model.ts` | 1 | + `'awaiting_decision'` to TASK_STATUSES + ACTIVE_STATUSES |
| 2 | `src/domain/task/transitions.ts` | 1 | + awaiting_decision transitions; + `running→awaiting_decision` |
| 3 | `src/domain/task/pipeline-partition.ts` | 1 | + awaiting_decision to pipeline rank |
| 4 | `src/application/use-cases/task/manual-retry-task.ts` | 1 | + `'awaiting_decision'` to MANUAL_RETRY_FROM |
| 5 | `src/application/contracts/agent-farm-project-config.ts` | 5 | + `decision` config type |
| 6 | `src/application/contracts/claimed-task-commands.ts` | 7 | + optional `getTask()` method |
| 7 | `src/application/worker/process-claimed-task/context.ts` | 7 | + optional `decisionEngine` field |
| 8 | `src/application/worker/process-claimed-task/index.ts` | 7 | + decision gate; + `decisionEngine` dep |
| 9 | `src/application/worker/process-claimed-task/events.ts` | 7 | + `task_awaiting_decision` to stage union |
| 10 | `src/application/facades/control-plane.ts` | 6 | + requestDecision/resolveEscalation/listEscalations |
| 11 | `src/application/facades/worker.ts` | 7 | pass decisionEngine to processClaimedTask |
| 12 | `src/bootstrap/container.ts` | 5 | wire DecisionEngine/DecisionRepository/DecisionService |
| 13 | `src/infrastructure/persistence/sqlite/db.ts` | 3 | + `decisions` table to ensureSchema |
| 14 | `src/interfaces/mcp/server.ts` | 6 | + 3 new MCP tools |
| 15 | `src/interfaces/cli/register/index.ts` | 8 | + registerDecisionCommands |
| 16 | `src/application/public-api.ts` | 5 | + export new types |

---

## Phase 1: Domain Model 实现细节

### `src/domain/task/model.ts`

```typescript
// 在 "approved" 之后, "rejected" 之前插入
export const TASK_STATUSES = [
  "queued", "retry", "claimed", "running",
  "review", "approved", "awaiting_decision", "rejected",
  "done", "failed", "cancelled", "blocked",
] as const;

// 加入 ACTIVE_STATUSES — 决策等待中仍算活跃状态
export const ACTIVE_STATUSES = new Set<TaskStatus>([
  "queued", "retry", "claimed", "running",
  "review", "approved", "awaiting_decision",
]);
```

### `src/domain/task/transitions.ts`

```typescript
const ALLOWED_TRANSITIONS: Record<TaskStatus, Set<TaskStatus>> = {
  // ... existing ...
  running: new Set(["review", "retry", "failed", "blocked", "cancelled", "awaiting_decision"]),
  // + new entry:
  awaiting_decision: new Set(["retry", "failed", "queued", "blocked"]),
  // ... rest unchanged ...
};
```

### `src/domain/task/pipeline-partition.ts`

将 `awaiting_decision` 加入 pipeline（非 terminal）:
```typescript
const pipelineStatuses: TaskStatus[] = [
  "queued", "retry", "claimed", "running", "review", "approved", "awaiting_decision"
];
```

### `src/domain/decision/model.ts`

完整类型定义（见设计文档 §3）。关键点：
- `DecisionEnginePort` 是 interface，不是 type alias — 方便 mock
- `DecisionResult` 是 discriminated union (`escalated: true | false`)
- `DecisionRule.priority` 默认 0，越大越优先

### `src/domain/decision/fingerprint.ts`

```typescript
/** 将 context + options 转为归一化 token 数组 */
export function fingerprintContext(context: string, options: string[]): string[] {
  const text = `${context} ${options.join(" ")}`.toLowerCase();
  return text
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2)
    .filter(t => !STOP_WORDS.has(t))  // 过滤 the/a/an/is/are/for/to/...
    .sort();
}

/** Jaccard 相似度 */
export function fingerprintSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}
```

### `src/domain/decision/rules.ts`

```typescript
/**
 * 纯函数 — 无副作用，方便单元测试。
 * 返回 null 表示无规则匹配。
 */
export function matchRules(
  request: DecisionRequest,
  rules: DecisionRule[],
): DecisionResult | null { ... }

export function calculateRuleConfidence(
  rule: DecisionRule,
  request: DecisionRequest,
): number { ... }
```

---

## Phase 2: DecisionEngine 实现细节

### `src/application/engines/decision-engine.ts`

```typescript
import type { DecisionEnginePort } from "../../domain/decision/model.js";
import type { DecisionRepository } from "../contracts/decision-repository.js";
import { matchRules } from "../../domain/decision/rules.js";
import { fingerprintContext, fingerprintSimilarity } from "../../domain/decision/fingerprint.js";

export class DecisionEngine implements DecisionEnginePort {
  constructor(
    private readonly ruleBase: DecisionRule[],
    private readonly decisionRepo: DecisionRepository,
    private readonly autoThreshold: number,
    private readonly clock: IsoClock,
  ) {}

  async evaluate(request: DecisionRequest): Promise<DecisionResult> {
    // Step 1: Rules
    const ruleMatch = matchRules(request, this.ruleBase);
    if (ruleMatch && ruleMatch.confidence >= this.autoThreshold) {
      return ruleMatch;
    }

    // Step 2: History
    const fp = fingerprintContext(request.context, request.options);
    const similar = await this.decisionRepo.findSimilar(
      request.task_id,
      fp.join(" "),
      0.7,
    );
    if (similar.length > 0) {
      const best = similar[0]!;
      if (best._similarity >= this.autoThreshold) {
        return {
          decision_id: request.decision_id,
          chosen: best.chosen!,
          reason: `Historical decision #${best.id} (${Math.round(best._similarity * 100)}% similar): ${best.reason}`,
          resolved_by: "history",
          confidence: best._similarity,
          escalated: false,
        };
      }
    }

    // Step 3: [future] LLM resolver slot
    // if (this.llmResolver) { ... }

    // Step 4: Escalate
    return {
      decision_id: request.decision_id,
      escalated: true,
      escalation_id: `esc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      reason: "No matching rules or historical precedent. Needs human input.",
    };
  }

  async resolveEscalation(
    escalationId: string,
    choice: string,
    reason: string,
  ): Promise<DecisionRecord> { ... }

  getRules(): DecisionRule[] { return this.ruleBase; }
  getProjectConfig(): unknown { return { threshold: this.autoThreshold }; }
}
```

---

## Phase 3: Persistence 实现细节

### `src/application/contracts/decision-repository.ts`

```typescript
export interface DecisionRepository {
  save(record: DecisionRecord): Promise<void>;
  findById(id: string): Promise<DecisionRecord | null>;
  findByTask(taskId: string): Promise<DecisionRecord[]>;
  findSimilar(
    taskId: string,
    fingerprint: string,
    minSimilarity: number,
  ): Promise<Array<DecisionRecord & { _similarity: number }>>;
  listEscalated(): Promise<DecisionRecord[]>;
  update(id: string, patch: Partial<DecisionRecord>): Promise<DecisionRecord>;
}
```

### `src/infrastructure/persistence/sqlite/db.ts` — 新增表

```sql
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  context TEXT NOT NULL,
  context_fingerprint TEXT NOT NULL,
  options TEXT NOT NULL,
  chosen TEXT,
  reason TEXT DEFAULT '',
  resolved_by TEXT,
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_decisions_task_id ON decisions(task_id);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
```

### `src/infrastructure/persistence/sqlite/decisions.ts`

遵循 `src/infrastructure/persistence/sqlite/tasks.ts` 的 exact pattern:
- `openDb(this.dbFile)` 获取 shared connection
- `db.prepare(...)` + transaction 做 insert/update
- `findSimilar`: load all → in-memory Jaccard → sort → top 5

```typescript
export class SqliteDecisionRepository implements DecisionRepository {
  constructor(private readonly dbFile: string) {}

  async save(record: DecisionRecord): Promise<void> { ... }
  async findById(id: string): Promise<DecisionRecord | null> { ... }
  async findByTask(taskId: string): Promise<DecisionRecord[]> { ... }
  async findSimilar(
    taskId: string, fingerprint: string, minSimilarity: number
  ): Promise<Array<DecisionRecord & { _similarity: number }>> {
    const fpTokens = fingerprint.split(" ");
    const all = await this.#all();
    return all
      .filter(r => r.task_id !== taskId && r.chosen !== null)
      .map(r => ({
        ...r,
        _similarity: fingerprintSimilarity(fpTokens, (r.context_fingerprint ?? "").split(" ")),
      }))
      .filter(r => r._similarity >= minSimilarity)
      .sort((a, b) => b._similarity - a._similarity)
      .slice(0, 5);
  }
  async listEscalated(): Promise<DecisionRecord[]> { ... }
  async update(id: string, patch: Partial<DecisionRecord>): Promise<DecisionRecord> { ... }
}
```

---

## Phase 4: Use Cases 实现细节

### `src/application/use-cases/decision/request-decision.ts`

```typescript
export class RequestDecisionUseCase {
  constructor(
    private readonly engine: DecisionEnginePort,
    private readonly decisionRepo: DecisionRepository,
    private readonly taskCommands: ClaimedTaskCommands,
    private readonly eventRepo: EventRepository,
    private readonly clock: IsoClock,
  ) {}

  async execute(request: DecisionRequest): Promise<DecisionResult> {
    const result = await this.engine.evaluate(request);

    // 持久化审计记录
    const fp = fingerprintContext(request.context, request.options).join(" ");
    const record: DecisionRecord = {
      id: result.escalated ? result.escalation_id : result.decision_id,
      task_id: request.task_id,
      decision_id: request.decision_id,
      context: request.context,
      context_fingerprint: fp,
      options: request.options,
      chosen: result.escalated ? null : (result as { chosen: string }).chosen,
      reason: result.reason,
      resolved_by: result.escalated ? null : (result as { resolved_by: string }).resolved_by,
      confidence: result.escalated ? null : (result as { confidence: number }).confidence,
      status: result.escalated ? "escalated" : "resolved",
      created_at: this.clock(),
    };
    await this.decisionRepo.save(record);

    // 如果升级: 转换 task 状态
    if (result.escalated) {
      await this.taskCommands.updateStatus(request.task_id, "awaiting_decision", {
        _escalation_id: result.escalation_id,
        _decision_context: request.context,
        _decision_options: JSON.stringify(request.options),
      });
      await this.eventRepo.append({
        ts: this.clock(),
        event: "task_awaiting_decision",
        task_id: request.task_id,
        escalation_id: result.escalation_id,
      });
    }

    return result;
  }
}
```

### `src/application/use-cases/decision/resolve-escalation.ts`

```typescript
export class ResolveEscalationUseCase {
  constructor(
    private readonly decisionRepo: DecisionRepository,
    private readonly taskCommands: ClaimedTaskCommands,
    private readonly eventRepo: EventRepository,
    private readonly clock: IsoClock,
  ) {}

  async execute(
    escalationId: string,
    choice: string,
    reason: string,
    resetTask: boolean,
  ): Promise<{ decision: DecisionRecord }> {
    const record = await this.decisionRepo.findById(escalationId);
    if (!record) throw new Error(`Escalation ${escalationId} not found`);

    // 更新决策记录
    const updated = await this.decisionRepo.update(escalationId, {
      chosen: choice,
      reason: `${record.reason}\n[Resolved] ${reason}`,
      resolved_by: "human",
      status: "resolved",
      resolved_at: this.clock(),
    });

    // 重置 task
    if (resetTask) {
      await this.taskCommands.updateStatus(record.task_id, "retry", {
        prompt_appendix: `\n\n[decision-resolved]\nEscalation ${escalationId}: chose "${choice}". ${reason}\nContinue with this decision.`,
      });
      await this.eventRepo.append({
        ts: this.clock(),
        event: "task_decision_resolved",
        task_id: record.task_id,
        escalation_id: escalationId,
        chosen: choice,
      });
    }

    return { decision: updated };
  }
}
```

---

## Phase 5-8: DI / MCP / Worker / CLI

### Container (Phase 5)

`src/bootstrap/container.ts` 新增:
```typescript
// 加载决策规则
const decisionRules = loadDecisionRules(ports, projectConfig);
const decisionRepo = storage === "sqlite"
  ? new SqliteDecisionRepository(dbFile)
  : new JsonlDecisionRepository(paths.decisionFile ?? join(runsDir, "decisions.jsonl"));

const autoThreshold = projectConfig?.decision?.auto_threshold ?? 0.85;
const decisionEngine = new DecisionEngine(decisionRules, decisionRepo, autoThreshold, systemIsoClock);
const decisionService = new DecisionService(decisionEngine, decisionRepo, taskRepo, eventRepo, systemIsoClock);

return {
  // ... existing ...
  decisionService,
  decisionEngine,
  decisionRepo,
};
```

### MCP Tools (Phase 6)

`src/interfaces/mcp/server.ts` 中新增（遵循现有 pattern，每 tool 一个 `server.tool()` 调用）:

1. **`farm_request_decision`** — 参见设计文档 §7
2. **`farm_list_escalations`** — 调用 `service.listEscalations(task_id)`
3. **`farm_resolve_escalation`** — 调用 `service.resolveEscalation(id, choice, reason, resetTask)`

### Worker Pipeline (Phase 7)

`src/application/worker/process-claimed-task/index.ts` 修改:

1. `ProcessClaimedTaskDeps` 加 `decisionEngine?: DecisionEnginePort`
2. 在 execute + verify 之后，review block 之前插入:
```typescript
// Decision gate
const decisionResult = await runAwaitingDecisionStage(shellCtx, {
  decisionEngineEnabled: deps.decisionEngine != null,
});
if (decisionResult.kind === "awaiting_decision") {
  return;  // release worker
}
```

### CLI (Phase 8)

`src/interfaces/cli/register/decision.ts` — 遵循 `register/stuck.ts` 的 subcommand 模式:
```typescript
export function registerDecisionCommands(program: Command): void {
  const decision = program.command("decision").description("Manage escalated decisions");

  decision.command("list")
    .description("List escalated decisions waiting for resolution")
    .option("--task <id>", "Filter by task ID")
    .action(async (opts) => { ... });

  decision.command("resolve")
    .description("Resolve an escalated decision")
    .argument("<escalation-id>", "Escalation ID")
    .requiredOption("--choice <opt>", "Chosen option")
    .requiredOption("--reason <text>", "Reason for choice")
    .option("--no-retry", "Do not reset task to retry")
    .action(async (escalationId, opts) => { ... });
}
```

---

## Testing Strategy

### Unit Tests (vitest)
- `fingerprint.test.ts`: 测试 determinism, similarity 极端值 (identical=1.0, disjoint=0.0)
- `rules.test.ts`: 测试匹配/不匹配/多规则优先级/option 过滤
- `decision-engine.test.ts`: mock DecisionRepository, 测试 evaluate 三步（rule→history→escalate）

### Integration Tests
- `request-decision.test.ts`: 真实 DecisionEngine + mock repo → 验证 DecisionRecord 保存
- `resolve-escalation.test.ts`: escalated record → resolve → 验证 task 转 retry + prompt 注入

### End-to-End
```bash
# 1. 启动 MCP server
npm run farm:mcp &

# 2. 通过 MCP Inspector 调用 farm_request_decision
# 验证自动裁决返回

# 3. 无规则匹配 → 验证 escalation 返回
# 验证 task 进入 awaiting_decision

# 4. CLI 解决
agent-farm decision resolve esc_xxx --choice "X" --reason "test"

# 5. 验证 task 回到 retry 状态
agent-farm queue list
```

---

## Pattern Conventions (Do Not Deviate)

| Pattern | Reference | Apply To |
|---------|-----------|----------|
| Stage discriminated union | `stage-ai-review.ts` → `AiReviewStageResult` | `stage-awaiting-decision.ts` → `AwaitingDecisionStageResult` |
| MCP tool registration | `server.ts` lines 30-120 | New tools use exact same try/catch + jsonResult/jsonError |
| Facade class | `QueueService` class with private use cases | `DecisionService` |
| Use case class | `ReviewApproveUseCase` with constructor + execute() | All decision use cases |
| SQLite repository | `SqliteTaskRepository` pattern (dbFile, prepare, transactions) | `SqliteDecisionRepository` |
| CLI register fn | `registerStuckCommands(program: Command)` | `registerDecisionCommands(program: Command)` |
| Container DI | Manual constructor injection, return plain object | Wire in `container.ts` |
| Public API export | Named exports in `public-api.ts` | Export decision types and facade |
