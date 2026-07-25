# Cost & Token Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement model-level cost tracking and visualization for agent-farm-cli — parse token usage from NDJSON streams, persist to execution_memory, add `insights --cost` view, dashboard cost column, and cost anomaly detection.

**Architecture:** Six-layer incremental build-up. Start from the data source (NDJSON parsers), persist via execution_memory, build the pricing module, then expose through insights CLI, dashboard TUI, and anomaly detection. Each layer depends only on previous layers.

**Tech Stack:** TypeScript (strict ESM), SQLite (better-sqlite3), Ink (React TUI), Vitest

## Global Constraints

- TypeScript strict ESM; follow existing code patterns exactly
- Queue via CLI only — never direct SQLite writes outside the repository layer
- Run `npm test` after each task; fix any failures before proceeding
- Follow existing naming conventions: `src/domain/` for interfaces, `src/infrastructure/` for implementations, `src/application/` for services

---

## File Structure

```
New files:
  src/application/executors/model-pricing.ts          — model price table + resolution
  test/application/model-pricing.test.ts              — pricing tests

  (token extraction modifies existing parsers — no new files)

Modified files (by layer):
  Layer 1 — Token extraction:
    src/domain/ports/agent-stream-observer.ts          — add token fields to AgentStreamSummary
    src/infrastructure/opencode/opencode-json-stream.ts — capture usage.input_tokens/output_tokens
    src/infrastructure/claude-code/claude-code-json-stream.ts — capture usage fields

  Layer 2 — Execution memory:
    src/domain/execution-memory/model.ts               — add input_tokens, output_tokens, cost_cents
    src/infrastructure/persistence/sqlite/db.ts        — ALTER TABLE / CREATE TABLE
    src/infrastructure/persistence/sqlite/execution-memory.ts — update insert, deserialize, add queries
    src/domain/ports/repositories.ts                   — add costSummary method
    src/application/worker/execution-memory-recorder.ts — extract tokens from stream observer

  Layer 3 — Model pricing:
    (new files listed above)

  Layer 4 — Insights --cost:
    src/application/facades/insights.ts                — buildCostReport(), cost anomaly
    src/interfaces/cli/register/insights.ts            — --cost flag, printCostBrief()

  Layer 5 — Dashboard cost column:
    src/interfaces/cli/tui/task-dashboard/dashboard-layout.ts — add cost column
    src/interfaces/cli/tui/task-dashboard/components/pipeline-task-list.tsx — render cost

  Layer 6 — Cost anomaly:
    src/application/facades/insights.ts                — costAnomalyCheck()
    src/infrastructure/persistence/sqlite/execution-memory.ts — avgTokensByTaskType query
```

---

### Task 1: Token extraction — extend AgentStreamSummary interface

**Files:**
- Modify: `src/domain/ports/agent-stream-observer.ts:1-17`

**Interfaces:**
- Produces: `AgentStreamSummary` gains optional `inputTokens?: number` and `outputTokens?: number`

- [ ] **Step 1: Add token fields to AgentStreamSummary**

Open `src/domain/ports/agent-stream-observer.ts`. Add `inputTokens` and `outputTokens` to the summary type:

```ts
/** Agent 流输出摘要（execute/verify/ai-review 阶段 NDJSON 解析结果） */
export interface AgentStreamSummary {
  linesOk: number;
  linesInvalid: number;
  errorSnippets: string[];
  toolIssues: string[];
  toolCallCount: number;
  /** Cumulative input tokens from all result events in the stream */
  inputTokens?: number;
  /** Cumulative output tokens from all result events in the stream */
  outputTokens?: number;
}
```

- [ ] **Step 2: Run existing tests to verify no regressions**

```bash
npm test
```
Expected: All tests pass (the new fields are optional so no consumers break).

- [ ] **Step 3: Commit**

```bash
git add src/domain/ports/agent-stream-observer.ts
git commit -m "feat: add inputTokens/outputTokens to AgentStreamSummary"
```

---

### Task 2: Token extraction — capture tokens from OpenCode NDJSON

**Files:**
- Modify: `src/infrastructure/opencode/opencode-json-stream.ts:1-153`

**Interfaces:**
- Consumes: `AgentStreamSummary` from Task 1 (optional token fields)
- Produces: `OpencodeStreamSummary` gains `inputTokens`/`outputTokens` accumulated from `usage` fields in result events

- [ ] **Step 1: Write failing test for OpenCode token extraction**

Create test content. The key behavior: `createOpencodeJsonStreamObserver()` should accumulate `input_tokens` and `output_tokens` from `type: "result"` NDJSON lines.

Write test file content inline:

```ts
// file: test/application/opencode-token-stream.test.ts
import { describe, it, expect } from "vitest";
import { createOpencodeJsonStreamObserver } from "../../src/infrastructure/opencode/opencode-json-stream.js";

describe("createOpencodeJsonStreamObserver — token extraction", () => {
  it("accumulates input_tokens and output_tokens from result events", () => {
    const obs = createOpencodeJsonStreamObserver();

    obs.onStdoutLine(JSON.stringify({ type: "result", usage: { input_tokens: 1500, output_tokens: 300 } }));
    obs.onStdoutLine(JSON.stringify({ type: "result", usage: { input_tokens: 800, output_tokens: 200 } }));
    obs.onStdoutLine(JSON.stringify({ type: "assistant", content: "hello" }));

    const snap = obs.snapshot();
    expect(snap.inputTokens).toBe(1500 + 800);
    expect(snap.outputTokens).toBe(300 + 200);
  });

  it("handles result events without usage field gracefully", () => {
    const obs = createOpencodeJsonStreamObserver();
    obs.onStdoutLine(JSON.stringify({ type: "result", text: "done" }));
    const snap = obs.snapshot();
    expect(snap.inputTokens).toBeUndefined();
    expect(snap.outputTokens).toBeUndefined();
  });

  it("skips non-numeric usage values", () => {
    const obs = createOpencodeJsonStreamObserver();
    obs.onStdoutLine(JSON.stringify({ type: "result", usage: { input_tokens: "abc", output_tokens: 100 } }));
    const snap = obs.snapshot();
    // input_tokens was not a number, so only output_tokens counted
    expect(snap.inputTokens).toBeUndefined();
    expect(snap.outputTokens).toBe(100);
  });

  it("handles null/undefined usage gracefully", () => {
    const obs = createOpencodeJsonStreamObserver();
    obs.onStdoutLine(JSON.stringify({ type: "result", usage: null }));
    const snap = obs.snapshot();
    expect(snap.inputTokens).toBeUndefined();
    expect(snap.outputTokens).toBeUndefined();
  });

  it("does not add tokens when no result events seen", () => {
    const obs = createOpencodeJsonStreamObserver();
    obs.onStdoutLine(JSON.stringify({ type: "assistant", content: "hello" }));
    obs.onStdoutLine(JSON.stringify({ type: "tool_call", tool: "read" }));
    const snap = obs.snapshot();
    expect(snap.inputTokens).toBeUndefined();
    expect(snap.outputTokens).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run test/application/opencode-token-stream.test.ts
```
Expected: FAIL — `inputTokens` is `undefined`.

- [ ] **Step 3: Implement token accumulation in digestUnknownRecord**

In `src/infrastructure/opencode/opencode-json-stream.ts`, modify the `digestUnknownRecord` function. After the existing tool_call handling, add token accumulation:

Add after `summary.toolCallCount++` line (line ~60):

```ts
  // Token usage from result events (OpenCode NDJSON)
  if (ty === "result") {
    const usage = obj.usage as Record<string, unknown> | undefined;
    if (usage && typeof usage === "object") {
      const input = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
      const output = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
      if (input !== undefined) {
        summary.inputTokens = (summary.inputTokens ?? 0) + input;
      }
      if (output !== undefined) {
        summary.outputTokens = (summary.outputTokens ?? 0) + output;
      }
    }
  }
```

Add `inputTokens` and `outputTokens` fields to the `OpencodeStreamSummary` type:

```ts
export type OpencodeStreamSummary = {
  linesOk: number;
  linesInvalid: number;
  eventTypes: string[];
  errorSnippets: string[];
  toolIssues: string[];
  toolCallCount: number;
  inputTokens?: number;
  outputTokens?: number;
};
```

Update the `snapshot()` return to include tokens:

```ts
    snapshot: () => ({
      linesOk: summary.linesOk,
      linesInvalid: summary.linesInvalid,
      eventTypes: [...summary.eventTypes.slice(-30)],
      errorSnippets: [...summary.errorSnippets],
      toolIssues: [...summary.toolIssues],
      toolCallCount: summary.toolCallCount,
      inputTokens: summary.inputTokens,
      outputTokens: summary.outputTokens,
    }),
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run test/application/opencode-token-stream.test.ts
```
Expected: PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/opencode/opencode-json-stream.ts test/application/opencode-token-stream.test.ts
git commit -m "feat: extract input_tokens/output_tokens from OpenCode NDJSON result events"
```

---

### Task 3: Token extraction — capture tokens from Claude Code stream-json

**Files:**
- Modify: `src/infrastructure/claude-code/claude-code-json-stream.ts:1-181`

**Interfaces:**
- Consumes: `AgentStreamSummary` from Task 1
- Produces: `ClaudeCodeStreamSummary` gains `inputTokens`/`outputTokens`

- [ ] **Step 1: Write failing test for Claude Code token extraction**

```ts
// file: test/application/claude-code-token-stream.test.ts
import { describe, it, expect } from "vitest";
import { createClaudeCodeJsonStreamObserver } from "../../src/infrastructure/claude-code/claude-code-json-stream.js";

describe("createClaudeCodeJsonStreamObserver — token extraction", () => {
  it("accumulates input_tokens and output_tokens from result events", () => {
    const obs = createClaudeCodeJsonStreamObserver();

    obs.onStdoutLine(JSON.stringify({ type: "result", subtype: "success", usage: { input_tokens: 2000, output_tokens: 500 } }));
    obs.onStdoutLine(JSON.stringify({ type: "result", subtype: "success", usage: { input_tokens: 1000, output_tokens: 250 } }));

    const snap = obs.snapshot();
    expect(snap.inputTokens).toBe(3000);
    expect(snap.outputTokens).toBe(750);
  });

  it("skips error result events for token counting", () => {
    const obs = createClaudeCodeJsonStreamObserver();
    // Claude can still emit usage on error results — we still count them for observability
    obs.onStdoutLine(JSON.stringify({ type: "result", subtype: "error_during_execution", usage: { input_tokens: 500, output_tokens: 0 } }));
    const snap = obs.snapshot();
    expect(snap.inputTokens).toBe(500);
    expect(snap.outputTokens).toBe(0);
  });

  it("does not add tokens for non-result events", () => {
    const obs = createClaudeCodeJsonStreamObserver();
    obs.onStdoutLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hi" }] } }));
    const snap = obs.snapshot();
    expect(snap.inputTokens).toBeUndefined();
    expect(snap.outputTokens).toBeUndefined();
  });

  it("handles missing usage gracefully", () => {
    const obs = createClaudeCodeJsonStreamObserver();
    obs.onStdoutLine(JSON.stringify({ type: "result", subtype: "success" }));
    const snap = obs.snapshot();
    expect(snap.inputTokens).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run test/application/claude-code-token-stream.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement token accumulation in digestUnknownRecord**

In `src/infrastructure/claude-code/claude-code-json-stream.ts`, modify `digestUnknownRecord`. After the `tool_use` handling inside the content blocks loop, add token accumulation. Insert after the existing `if (b.type === "tool_use") { summary.toolCallCount++; }` block (around line 59):

```ts
  // Token usage from result events (Claude Code stream-json)
  if (ty === "result") {
    const usage = obj.usage as Record<string, unknown> | undefined;
    if (usage && typeof usage === "object") {
      const input = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
      const output = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
      if (input !== undefined) {
        summary.inputTokens = (summary.inputTokens ?? 0) + input;
      }
      if (output !== undefined) {
        summary.outputTokens = (summary.outputTokens ?? 0) + output;
      }
    }
  }
```

Add `inputTokens`/`outputTokens` to `ClaudeCodeStreamSummary` type:

```ts
export type ClaudeCodeStreamSummary = {
  linesOk: number;
  linesInvalid: number;
  eventTypes: string[];
  errorSnippets: string[];
  toolIssues: string[];
  toolCallCount: number;
  inputTokens?: number;
  outputTokens?: number;
};
```

Update `snapshot()` to include tokens:

```ts
    snapshot: () => ({
      linesOk: summary.linesOk,
      linesInvalid: summary.linesInvalid,
      eventTypes: [...summary.eventTypes.slice(-30)],
      errorSnippets: [...summary.errorSnippets],
      toolIssues: [...summary.toolIssues],
      toolCallCount: summary.toolCallCount,
      inputTokens: summary.inputTokens,
      outputTokens: summary.outputTokens,
    }),
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run test/application/claude-code-token-stream.test.ts
```
Expected: PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/claude-code/claude-code-json-stream.ts test/application/claude-code-token-stream.test.ts
git commit -m "feat: extract input_tokens/output_tokens from Claude Code stream-json result events"
```

---

### Task 4: Model pricing module

**Files:**
- Create: `src/application/executors/model-pricing.ts`
- Create: `test/application/model-pricing.test.ts`

**Interfaces:**
- Produces:
  - `ModelPrice { input: number; output: number }` — per-1M-token USD prices
  - `DEFAULT_MODEL_PRICES: Record<string, ModelPrice>` — hardcoded table
  - `resolveModelPrice(model: string): ModelPrice` — resolve price with env override
  - `computeCostCents(inputTokens: number, outputTokens: number, price: ModelPrice): number` — compute cost in USD cents

- [ ] **Step 1: Write the pricing module**

File: `src/application/executors/model-pricing.ts`

```ts
/**
 * M4+ 模型定价：硬编码默认价格表 + AGENT_FARM_MODEL_PRICES 环境变量覆盖。
 * 价格为每百万 token 的 USD 价格。
 */

export type ModelPrice = {
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
};

/** 默认模型价格表（每百万 token USD）。来源：各模型官方定价页，2025–2026。 */
const DEFAULT_MODEL_PRICES: Record<string, ModelPrice> = {
  // Anthropic Claude
  "claude-opus-4-8": { input: 15, output: 75 },
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-opus-4": { input: 15, output: 75 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  "claude-haiku-4": { input: 0.8, output: 4 },
  "claude-fable-5": { input: 3, output: 15 },
  // OpenAI GPT
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "o4-mini": { input: 1.1, output: 4.4 },
  "o3": { input: 10, output: 40 },
  // DeepSeek
  "deepseek-v4": { input: 0.27, output: 1.1 },
  "deepseek-v3": { input: 0.27, output: 1.1 },
  "deepseek-r1": { input: 0.55, output: 2.19 },
};

/** 默认 fallback（未知模型用此价格，即 0 = 免费/未定价）。 */
const DEFAULT_ZERO_PRICE: ModelPrice = { input: 0, output: 0 };

let _envOverride: Record<string, ModelPrice> | null | undefined;

function loadEnvOverride(): Record<string, ModelPrice> | null {
  if (_envOverride !== undefined) return _envOverride;
  const raw = (process.env.AGENT_FARM_MODEL_PRICES ?? "").trim();
  if (!raw) {
    _envOverride = null;
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      _envOverride = parsed as Record<string, ModelPrice>;
      return _envOverride;
    }
  } catch {
    console.error("[agent-farm] failed to parse AGENT_FARM_MODEL_PRICES, using defaults");
  }
  _envOverride = null;
  return null;
}

/**
 * 解析模型价格。优先级：AGENT_FARM_MODEL_PRICES env → hardcoded table → zero.
 * Env 格式：'{"model":{"input":15,"output":75}}'
 */
export function resolveModelPrice(model: string): ModelPrice {
  const env = loadEnvOverride();
  if (env?.[model]) return env[model];

  // Try exact match first, then prefix match (e.g. "claude-opus-4-8-20251001" → "claude-opus-4-8")
  if (DEFAULT_MODEL_PRICES[model]) return DEFAULT_MODEL_PRICES[model];

  for (const [key, price] of Object.entries(DEFAULT_MODEL_PRICES)) {
    if (model.startsWith(key)) return price;
  }

  return DEFAULT_ZERO_PRICE;
}

/**
 * Compute cost in USD cents given token counts and price per 1M tokens.
 * Returns integer cents (rounded).
 */
export function computeCostCents(inputTokens: number, outputTokens: number, price: ModelPrice): number {
  const cost =
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output;
  return Math.round(cost * 100);
}

/** Format cents as human-readable USD string (e.g. "$0.042" or "$1.23"). */
export function formatCostCents(cents: number): string {
  const dollars = cents / 100;
  if (dollars < 0.01) return "<$0.01";
  if (dollars < 10) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(2)}`;
}
```

- [ ] **Step 2: Write tests**

File: `test/application/model-pricing.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resolveModelPrice, computeCostCents, formatCostCents } from "../../src/application/executors/model-pricing.js";

describe("resolveModelPrice", () => {
  it("returns price for known model (exact match)", () => {
    const price = resolveModelPrice("claude-opus-4-8");
    expect(price.input).toBe(15);
    expect(price.output).toBe(75);
  });

  it("returns price for known model (prefix match)", () => {
    const price = resolveModelPrice("claude-sonnet-5-20251001");
    expect(price.input).toBe(3);
    expect(price.output).toBe(15);
  });

  it("returns zero price for unknown model", () => {
    const price = resolveModelPrice("unknown-model-v1");
    expect(price.input).toBe(0);
    expect(price.output).toBe(0);
  });

  it("handles empty string", () => {
    const price = resolveModelPrice("");
    expect(price.input).toBe(0);
    expect(price.output).toBe(0);
  });
});

describe("computeCostCents", () => {
  it("computes cost in cents", () => {
    // 1000 input + 500 output at $15/$75 per 1M
    // cost = (1000/1M)*15 + (500/1M)*75 = 0.015 + 0.0375 = $0.0525 → 5 cents
    const cents = computeCostCents(1000, 500, { input: 15, output: 75 });
    expect(cents).toBe(5);
  });

  it("handles zero tokens", () => {
    const cents = computeCostCents(0, 0, { input: 15, output: 75 });
    expect(cents).toBe(0);
  });

  it("handles large token counts", () => {
    // 1M input + 1M output at $15/$75
    const cents = computeCostCents(1_000_000, 1_000_000, { input: 15, output: 75 });
    expect(cents).toBe(9000); // $90.00
  });
});

describe("formatCostCents", () => {
  it("formats zero", () => {
    expect(formatCostCents(0)).toBe("<$0.01");
  });
  it("formats small amount (< $10)", () => {
    expect(formatCostCents(42)).toBe("$0.420");
  });
  it("formats large amount (≥ $10)", () => {
    expect(formatCostCents(9000)).toBe("$90.00");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run test/application/model-pricing.test.ts
```
Expected: PASS.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/application/executors/model-pricing.ts test/application/model-pricing.test.ts
git commit -m "feat: add model pricing module with hardcoded table and env override"
```

---

### Task 5: Extend ExecutionMemoryRecord and SQLite table

**Files:**
- Modify: `src/domain/execution-memory/model.ts:1-32`
- Modify: `src/infrastructure/persistence/sqlite/db.ts:216-227` (CREATE TABLE)
- Modify: `src/infrastructure/persistence/sqlite/execution-memory.ts:1-157`

**Interfaces:**
- Consumes: `AgentStreamSummary` token fields from Task 1, `ModelPrice` from Task 4
- Produces: `ExecutionMemoryRecord` gains `input_tokens?: number`, `output_tokens?: number`, `cost_cents?: number`

- [ ] **Step 1: Extend ExecutionMemoryRecord**

In `src/domain/execution-memory/model.ts`, add token/cost fields:

```ts
/** 任务终态时写入执行记忆的一条记录。 */
export interface ExecutionMemoryRecord {
  task_id: string;
  dedupe_key: string;
  prompt: string;
  model: string;
  exit_code: number;
  diff_summary: DiffSummary | null;
  duration_ms: number;
  task_type: string;
  terminal_status: string;
  created_at: string;
  /** 累计输入 token 数（来自 NDJSON stream observer） */
  input_tokens?: number;
  /** 累计输出 token 数（来自 NDJSON stream observer） */
  output_tokens?: number;
  /** 预估成本（USD 分，写入时计算） */
  cost_cents?: number;
}
```

- [ ] **Step 2: Modify CREATE TABLE and add migration ALTER TABLE**

In `src/infrastructure/persistence/sqlite/db.ts`, update the execution_memory CREATE TABLE:

```ts
    CREATE TABLE IF NOT EXISTS execution_memory (
      task_id TEXT PRIMARY KEY,
      dedupe_key TEXT NOT NULL,
      prompt TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      exit_code INTEGER NOT NULL DEFAULT 0,
      diff_summary_json TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      task_type TEXT NOT NULL DEFAULT '',
      terminal_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cost_cents INTEGER
    );
```

After the CREATE TABLE block, add migration ALTER TABLE statements for existing databases:

```ts
    -- Migration: add token/cost columns to existing execution_memory tables
    ALTER TABLE execution_memory ADD COLUMN input_tokens INTEGER;
    ALTER TABLE execution_memory ADD COLUMN output_tokens INTEGER;
    ALTER TABLE execution_memory ADD COLUMN cost_cents INTEGER;
```

Wrap these in try-catch since they'll fail if columns already exist (SQLite `ALTER TABLE ADD COLUMN` only fails on duplicate column in newer versions, but in older versions we need to catch):

Actually, we should use a conditional approach. Let me look at how the existing db.ts handles migrations... 

The current code just uses `CREATE TABLE IF NOT EXISTS`. For alter, we need to handle the case where columns may already exist. Use a helper:

In `db.ts`, add after the existing `ensureSchema`:

```ts
function migrateExecutionMemoryColumns(db: ReturnType<typeof openDb>): void {
  // Check if columns exist (pragma table_info)
  const cols = db.pragma("table_info(execution_memory)") as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has("input_tokens")) {
    db.exec("ALTER TABLE execution_memory ADD COLUMN input_tokens INTEGER");
  }
  if (!colNames.has("output_tokens")) {
    db.exec("ALTER TABLE execution_memory ADD COLUMN output_tokens INTEGER");
  }
  if (!colNames.has("cost_cents")) {
    db.exec("ALTER TABLE execution_memory ADD COLUMN cost_cents INTEGER");
  }
}
```

Call `migrateExecutionMemoryColumns(db)` at the end of `ensureSchema`.

- [ ] **Step 3: Update SqliteExecutionMemoryRepository insert and deserialize**

In `src/infrastructure/persistence/sqlite/execution-memory.ts`:

Update the INSERT statement to include new columns:

```ts
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO execution_memory(task_id, dedupe_key, prompt, model, exit_code, diff_summary_json, duration_ms, task_type, terminal_status, created_at, input_tokens, output_tokens, cost_cents)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    await withBusyRetry(db, () =>
      stmt.run(
        record.task_id,
        record.dedupe_key,
        truncatePrompt(record.prompt),
        record.model,
        record.exit_code,
        record.diff_summary ? JSON.stringify(record.diff_summary) : null,
        record.duration_ms,
        record.task_type,
        record.terminal_status,
        nowIso(),
        record.input_tokens ?? null,
        record.output_tokens ?? null,
        record.cost_cents ?? null,
      ),
    );
```

Update `deserialize`:

```ts
  private deserialize(row: {
    task_id: string;
    dedupe_key: string;
    prompt: string;
    model: string;
    exit_code: number;
    diff_summary_json: string | null;
    duration_ms: number;
    task_type: string;
    terminal_status: string;
    created_at: string;
    input_tokens?: number | null;
    output_tokens?: number | null;
    cost_cents?: number | null;
  }): ExecutionMemoryRecord {
    // ... existing deserialization ...
    return {
      // ... existing fields ...
      input_tokens: row.input_tokens ?? undefined,
      output_tokens: row.output_tokens ?? undefined,
      cost_cents: row.cost_cents ?? undefined,
    };
  }
```

- [ ] **Step 4: Run full test suite**

```bash
npm test
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/execution-memory/model.ts src/infrastructure/persistence/sqlite/db.ts src/infrastructure/persistence/sqlite/execution-memory.ts
git commit -m "feat: add input_tokens/output_tokens/cost_cents to execution_memory schema"
```

---

### Task 6: Capture token data in execution memory recorder

**Files:**
- Modify: `src/application/worker/execution-memory-recorder.ts:1-88`
- Modify: `src/application/worker/process-claimed-task/index.ts:63-81` (recordMem closure)

**Interfaces:**
- Consumes: `AgentStreamObserver` snapshot from Task 1, `resolveModelPrice`/`computeCostCents` from Task 4
- Produces: `recordExecutionMemory` computes and stores token/cost data

- [ ] **Step 1: Extend recordExecutionMemory params and logic**

In `src/application/worker/execution-memory-recorder.ts`, add `streamObs` param:

```ts
import { resolveModelPrice, computeCostCents } from "../executors/model-pricing.js";
import type { AgentStreamObserver } from "../../domain/ports/agent-stream-observer.js";

/** 在任务到达终态时写入执行记忆。失败静默（不阻断任务管线）。 */
export async function recordExecutionMemory(params: {
  task: JsonMap;
  taskWorkspace: string;
  exitCode: number;
  durationMs: number;
  terminalStatus: string;
  projectConfig?: AgentFarmProjectConfig | null;
  executionMemoryRepo: ExecutionMemoryRepository;
  streamObs?: AgentStreamObserver | null;
}): Promise<void> {
  try {
    const { task, taskWorkspace, exitCode, durationMs, terminalStatus, projectConfig, executionMemoryRepo, streamObs } = params;
    // ... existing extraction ...
    const model = resolveModelFromContext(task, projectConfig) ?? "";

    // Extract token data from stream observer
    let input_tokens: number | undefined;
    let output_tokens: number | undefined;
    let cost_cents: number | undefined;
    if (streamObs) {
      const snap = streamObs.snapshot();
      input_tokens = snap.inputTokens;
      output_tokens = snap.outputTokens;
      if (input_tokens !== undefined || output_tokens !== undefined) {
        const price = resolveModelPrice(model);
        cost_cents = computeCostCents(input_tokens ?? 0, output_tokens ?? 0, price);
      }
    }

    const record: ExecutionMemoryRecord = {
      task_id: taskId,
      dedupe_key: dedupeKey,
      prompt,
      model,
      exit_code: exitCode,
      diff_summary: diffSummary,
      duration_ms: durationMs,
      task_type: taskType,
      terminal_status: terminalStatus,
      created_at: new Date().toISOString(),
      input_tokens,
      output_tokens,
      cost_cents,
    };
    // ...
  }
}
```

- [ ] **Step 2: Pass streamObs from processClaimedTask to recordMem**

In `src/application/worker/process-claimed-task/index.ts`, the `recordMem` closure needs `streamObs`. We need to capture it from the execute stage.

Update the `recordMem` definition (around line 69):

```ts
  const recordMem = async (exitCode: number, terminalStatus: string, taskWorkspace: string, streamObs?: AgentStreamObserver | null) => {
    if (!deps.executionMemoryRepo) return;
    const durationMs = Date.now() - startedAt;
    await recordExecutionMemory({
      task,
      taskWorkspace,
      exitCode,
      durationMs,
      terminalStatus,
      projectConfig: deps.projectConfig.load(mainWorkspace),
      executionMemoryRepo: deps.executionMemoryRepo,
      streamObs,
    });
  };
```

Then update all call sites to pass the stream observer. The key call site is inside the try block on the success path — we need to capture `execStream` (which comes back from `runExecuteStage`). Looking at the code flow:

- Line 181: `const execResult = await runExecuteStage(shellCtx, executeTemplate);` — this returns `{ok: true, output}` but the streamObs is not returned from runExecuteStage
- The stream observer is set via the callback in `resolveExecuteExecutor` at line 40-42

The simplest approach: store the stream observer on the shell context so it's accessible later. Add `streamObs?: AgentStreamObserver` to `ClaimedTaskShellContext`. But that changes the context type. A simpler approach: just pass it through from `runTemplateStage` result in stage-execute.

Looking at `stage-execute.ts` line 48: `const { exit_code: execCode, output: execOut, streamObs: execStream } = await runTemplateStage(ctx, executor);`

But `execStream` is local to `stage-execute.ts`. The cleanest minimal change: modify `runExecuteStage` to return `streamObs` on the ok path, and capture it in the main processClaimedTask function.

Actually, the simplest approach: pass `streamObs` through the `recordMem` calls at each exit point. Looking at all recordMem calls:
- Line 105: `await recordMem(-1, "blocked", mainWorkspace);` — dedupe blocked (no stream)
- Line 200: `await recordMem(1, "failed", taskWorkspace);` — decision fail (after execute, but stream may have been from execute)
- Line 233: `await recordMem(0, "done", taskWorkspace);` — acceptance done
- Line 258: two calls for blocked/failed ai review
- Line 280: `await recordMem(0, "done", taskWorkspace);` — auto-approve done

The simplest approach: track streamObs at the top level of processClaimedTask and pass it. We can get it from the execute stage result.

Actually, let me look at this more carefully. The `streamObs` variable is already being captured at line 49: `streamObs = execStream;` after `runTemplateStage`. But `execStream` is scoped inside the `runExecuteStage` function. The `empty-run-monitor` gets it via `getStreamObs: () => streamObs` callback.

The key insight: we need to propagate streamObs out of `runExecuteStage` on the success path. Let me modify the approach slightly:

Change `runExecuteStage` to return `streamObs` on ok:

```ts
// In stage-execute.ts, change return type:
): Promise<{ ok: true; output: string; streamObs?: AgentStreamObserver } | { ok: false }> {
  // ...
  return { ok: true, output: execOut, streamObs };
}
```

Then in `processClaimedTask`, capture it:

```ts
const execResult = await runExecuteStage(shellCtx, executeTemplate);
if (!execResult.ok) return;
const executeStreamObs = execResult.streamObs;
```

And pass it to all subsequent `recordMem` calls:
```ts
await recordMem(exitCode, status, taskWorkspace, executeStreamObs);
```

This is clean and minimal. Update all call sites.

The dedupe-blocked call doesn't run execute, so pass no streamObs:
```ts
await recordMem(-1, "blocked", mainWorkspace);  // no streamObs
```

Decision fail: happens after execute but before finish, so we have streamObs:
```ts
await recordMem(1, "failed", taskWorkspace, executeStreamObs);
```

Success paths:
```ts
await recordMem(0, "done", taskWorkspace, executeStreamObs);
```

Actually, this is getting complex for the plan. Let me simplify: modify `runExecuteStage` to return streamObs, and pass it through. The plan steps can reference the specific lines.

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: All tests pass (may need to update test fixtures for new recordMem signature).

- [ ] **Step 4: Commit**

```bash
git add src/application/worker/execution-memory-recorder.ts src/application/worker/process-claimed-task/index.ts src/application/worker/process-claimed-task/stage-execute.ts
git commit -m "feat: capture token data from stream observer into execution memory"
```

---

### Task 7: Insights --cost view

**Files:**
- Modify: `src/domain/ports/repositories.ts:57` — add costSummary method
- Modify: `src/infrastructure/persistence/sqlite/execution-memory.ts` — implement costSummary
- Modify: `src/application/facades/insights.ts` — add buildCostReport()
- Modify: `src/interfaces/cli/register/insights.ts` — add --cost flag

**Interfaces:**
- Produces: `costSummary()` on repository returns aggregated cost data; `buildCostReport()` on InsightsService returns JSON report; `--cost` flag on CLI

- [ ] **Step 1: Add costSummary to ExecutionMemoryRepository**

In `src/domain/ports/repositories.ts`, add:

```ts
  /** Cost aggregation: total cost, tokens, and counts per dimension (task_type, model, dedupe_key prefix). */
  costSummary(): Promise<CostSummary>;
```

And define the CostSummary type. Add to the beginning of the file or a new types import:

```ts
/** Aggregated cost summary from execution memory. */
export type CostSummary = {
  by_task_type: Array<{ task_type: string; cost_cents: number; input_tokens: number; output_tokens: number; count: number }>;
  by_model: Array<{ model: string; cost_cents: number; input_tokens: number; output_tokens: number; count: number }>;
  by_wave: Array<{ wave_prefix: string; cost_cents: number; input_tokens: number; output_tokens: number; count: number }>;
  total: { cost_cents: number; input_tokens: number; output_tokens: number; count: number };
};
```

- [ ] **Step 2: Implement costSummary in SQLite repo**

In `src/infrastructure/persistence/sqlite/execution-memory.ts`, add:

```ts
  async costSummary(): Promise<CostSummary> {
    const db = openDb(this.dbFile);

    const byTaskType = db.prepare(`
      SELECT task_type, COALESCE(SUM(cost_cents), 0) as cost_cents,
             COALESCE(SUM(input_tokens), 0) as input_tokens,
             COALESCE(SUM(output_tokens), 0) as output_tokens,
             COUNT(*) as count
      FROM execution_memory
      WHERE task_type != '' AND cost_cents IS NOT NULL
      GROUP BY task_type
      ORDER BY cost_cents DESC
    `).all() as Array<{ task_type: string; cost_cents: number; input_tokens: number; output_tokens: number; count: number }>;

    const byModel = db.prepare(`
      SELECT model, COALESCE(SUM(cost_cents), 0) as cost_cents,
             COALESCE(SUM(input_tokens), 0) as input_tokens,
             COALESCE(SUM(output_tokens), 0) as output_tokens,
             COUNT(*) as count
      FROM execution_memory
      WHERE model != '' AND cost_cents IS NOT NULL
      GROUP BY model
      ORDER BY cost_cents DESC
    `).all() as Array<{ model: string; cost_cents: number; input_tokens: number; output_tokens: number; count: number }>;

    // Wave aggregation: group by dedupe_key prefix (up to first '-')
    const byWave = db.prepare(`
      SELECT
        CASE
          WHEN instr(dedupe_key, '-') > 0
          THEN substr(dedupe_key, 1, instr(dedupe_key, '-') - 1)
          ELSE dedupe_key
        END as wave_prefix,
        COALESCE(SUM(cost_cents), 0) as cost_cents,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COUNT(*) as count
      FROM execution_memory
      WHERE dedupe_key != '' AND cost_cents IS NOT NULL
      GROUP BY wave_prefix
      ORDER BY cost_cents DESC
    `).all() as Array<{ wave_prefix: string; cost_cents: number; input_tokens: number; output_tokens: number; count: number }>;

    const total = db.prepare(`
      SELECT COALESCE(SUM(cost_cents), 0) as cost_cents,
             COALESCE(SUM(input_tokens), 0) as input_tokens,
             COALESCE(SUM(output_tokens), 0) as output_tokens,
             COUNT(*) as count
      FROM execution_memory
      WHERE cost_cents IS NOT NULL
    `).get() as { cost_cents: number; input_tokens: number; output_tokens: number; count: number };

    return { by_task_type: byTaskType, by_model: byModel, by_wave: byWave, total };
  }
```

- [ ] **Step 3: Add buildCostReport to InsightsService**

In `src/application/facades/insights.ts`:

```ts
  async buildCostReport(): Promise<JsonMap> {
    if (!this.executionMemoryRepo) {
      return { ok: true, cost: null, note: "execution_memory not available" };
    }
    try {
      const summary = await this.executionMemoryRepo.costSummary();
      return {
        ok: true,
        cost: {
          by_task_type: summary.by_task_type,
          by_model: summary.by_model,
          by_wave: summary.by_wave,
          total: summary.total,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
```

- [ ] **Step 4: Add --cost flag to CLI**

In `src/interfaces/cli/register/insights.ts`, add `--cost` option:

```ts
    .option("--cost", "show cost & token aggregation by task_type/model/wave")
```

In the action handler, check for `opts.cost`:

```ts
      if (opts.cost) {
        const report = await container.insightsService.buildCostReport();
        if (opts.brief) {
          printCostBrief(report);
          return;
        }
        await writePrettyJsonReportIfPath(opts.outputFile, report);
        print(report);
        return;
      }
```

Add `printCostBrief` helper:

```ts
function printCostBrief(report: Record<string, unknown>): void {
  const cost = (report.cost ?? report) as Record<string, unknown> | undefined;
  if (!cost) {
    writeCliBriefToStderr(["No cost data available."]);
    return;
  }
  const total = cost.total as Record<string, number> | undefined;
  const lines: string[] = [];
  if (total) {
    const dollars = (total.cost_cents ?? 0) / 100;
    lines.push(`total: $${dollars.toFixed(2)} (${total.count ?? 0} tasks, ${((total.input_tokens ?? 0) / 1000).toFixed(0)}K in / ${((total.output_tokens ?? 0) / 1000).toFixed(0)}K out)`);
  }

  const byModel = cost.by_model as Array<Record<string, unknown>> | undefined;
  if (byModel && byModel.length > 0) {
    lines.push("by model:");
    for (const m of byModel.slice(0, 8)) {
      const d = (Number(m.cost_cents ?? 0) / 100).toFixed(2);
      lines.push(`  ${String(m.model ?? "?")}: $${d} (${m.count ?? 0} tasks)`);
    }
  }

  const byType = cost.by_task_type as Array<Record<string, unknown>> | undefined;
  if (byType && byType.length > 0) {
    lines.push("by task_type:");
    for (const t of byType.slice(0, 5)) {
      const d = (Number(t.cost_cents ?? 0) / 100).toFixed(2);
      lines.push(`  ${String(t.task_type ?? "?")}: $${d} (${t.count ?? 0} tasks)`);
    }
  }

  writeCliBriefToStderr(lines);
}
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/domain/ports/repositories.ts src/infrastructure/persistence/sqlite/execution-memory.ts src/application/facades/insights.ts src/interfaces/cli/register/insights.ts
git commit -m "feat: add agent-farm insights --cost view with task_type/model/wave aggregation"
```

---

### Task 8: Cost anomaly detection

**Files:**
- Modify: `src/application/facades/insights.ts` — add costAnomalyCheck to build() output

**Interfaces:**
- Consumes: `costSummary()` from Task 7
- Produces: `cost_anomalies` field in insights report

- [ ] **Step 1: Add cost anomaly query capability**

In `src/infrastructure/persistence/sqlite/execution-memory.ts`, add a method to get average tokens per (task_type, model):

```ts
  async avgTokensByTaskTypeAndModel(): Promise<Array<{
    task_type: string;
    model: string;
    avg_input_tokens: number;
    avg_output_tokens: number;
    total_tasks: number;
  }>> {
    const db = openDb(this.dbFile);
    return db.prepare(`
      SELECT task_type, model,
             AVG(input_tokens) as avg_input_tokens,
             AVG(output_tokens) as avg_output_tokens,
             COUNT(*) as total_tasks
      FROM execution_memory
      WHERE input_tokens IS NOT NULL AND task_type != '' AND model != ''
      GROUP BY task_type, model
      HAVING total_tasks >= 3
      ORDER BY task_type, avg_input_tokens DESC
    `).all() as Array<{ task_type: string; model: string; avg_input_tokens: number; avg_output_tokens: number; total_tasks: number }>;
  }
```

And a query for high-cost outliers:

```ts
  async costAnomalies(thresholdMultiplier: number): Promise<Array<{
    task_id: string;
    task_type: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost_cents: number;
    avg_input_tokens: number;
    avg_output_tokens: number;
  }>> {
    const db = openDb(this.dbFile);
    return db.prepare(`
      SELECT em.task_id, em.task_type, em.model,
             em.input_tokens, em.output_tokens, em.cost_cents,
             avgs.avg_input_tokens, avgs.avg_output_tokens
      FROM execution_memory em
      JOIN (
        SELECT task_type, model,
               AVG(input_tokens) as avg_input_tokens,
               AVG(output_tokens) as avg_output_tokens
        FROM execution_memory
        WHERE input_tokens IS NOT NULL
        GROUP BY task_type, model
        HAVING COUNT(*) >= 3
      ) avgs ON em.task_type = avgs.task_type AND em.model = avgs.model
      WHERE em.input_tokens IS NOT NULL
        AND em.input_tokens > avgs.avg_input_tokens * ?
      ORDER BY em.input_tokens - avgs.avg_input_tokens DESC
      LIMIT 20
    `).all(thresholdMultiplier) as Array<{
      task_id: string; task_type: string; model: string;
      input_tokens: number; output_tokens: number; cost_cents: number;
      avg_input_tokens: number; avg_output_tokens: number;
    }>;
  }
```

Add declarations to the repository interface in `src/domain/ports/repositories.ts`.

- [ ] **Step 2: Wire into InsightsService.build()**

In `src/application/facades/insights.ts`, add cost anomaly to the build() output:

```ts
    // Cost anomaly detection
    let cost_anomalies: Array<Record<string, unknown>> = [];
    if (this.executionMemoryRepo) {
      try {
        cost_anomalies = await this.executionMemoryRepo.costAnomalies(2.0);
      } catch {
        // execution_memory table may not have token columns yet
      }
    }
```

Add `cost_anomalies` to the return object:

```ts
    return {
      ok: true,
      tasks_total: tasks.length,
      events_total: events.length,
      status_counts: statusCounts,
      failure_top: failureTop,
      duration_summary: { ... },
      failure_hotspots,
      model_recommendations,
      cost_anomalies,
      ...(resourceLeak ? { resource_leak: resourceLeak } : {}),
    };
```

- [ ] **Step 3: Display cost anomalies in insights brief**

In `src/interfaces/cli/register/insights.ts`, add cost anomaly display to `printBrief()`:

```ts
  const anomalies = report.cost_anomalies as Array<Record<string, unknown>> | undefined;
  if (anomalies && anomalies.length > 0) {
    lines.push("cost anomalies:");
    for (const a of anomalies.slice(0, 5)) {
      const dollars = (Number(a.cost_cents ?? 0) / 100).toFixed(3);
      const avgDollars = (Number(a.avg_cost_cents ?? 0) / 100).toFixed(3);
      lines.push(`  [cost-anomaly] ${String(a.task_id ?? "?")}: $${dollars} (avg $${avgDollars}, ${a.task_type}/${a.model})`);
    }
  }
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/domain/ports/repositories.ts src/infrastructure/persistence/sqlite/execution-memory.ts src/application/facades/insights.ts src/interfaces/cli/register/insights.ts
git commit -m "feat: add cost anomaly detection to insights"
```

---

### Task 9: Dashboard cost column

**Files:**
- Modify: `src/interfaces/cli/tui/task-dashboard/dashboard-layout.ts:1-106`
- Modify: `src/interfaces/cli/tui/task-dashboard/components/pipeline-task-list.tsx:1-119`

**Interfaces:**
- Consumes: `formatCostCents` from Task 4
- Produces: new optional cost column in dashboard pipeline view (gated by `AGENT_FARM_DASHBOARD_COST=1`)

- [ ] **Step 1: Add cost column to dashboard layout**

In `src/interfaces/cli/tui/task-dashboard/dashboard-layout.ts`, add `wCost` calculation:

```ts
  // Cost column (opt-in via AGENT_FARM_DASHBOARD_COST)
  const showCost = process.env.AGENT_FARM_DASHBOARD_COST === "1";
  const wCost = showCost ? 8 : 0;
```

Adjust column widths to accommodate cost (reduce `wIdPipe` slightly):

```ts
  let wIdPipe = Math.min(16, Math.max(7, Math.floor((outerWidth - 44 - wCost) * 0.22)));
  let pipeFixed = wPulse + wSt + wHb + wTm + wCost + wIdPipe;
```

Add cost column when enabled:

```ts
      columns: [
        { key: "pulse", width: wPulse, label: " " },
        { key: "st", width: wSt, label: "status" },
        { key: "hb", width: wHb, label: "since" },
        { key: "tm", width: wTm, label: "topic/mode" },
        ...(showCost ? [{ key: "cost", width: wCost, label: "cost" }] : []),
        { key: "id", width: wIdPipe, label: "task_id" },
      ],
```

- [ ] **Step 2: Render cost in pipeline task list**

In `src/interfaces/cli/tui/task-dashboard/components/pipeline-task-list.tsx`:

Add cost rendering. The task row needs access to cost data. Pipeline tasks get it from the execution_memory join or a separate lookup. Since we want to keep this simple and avoid blocking the dashboard on DB joins, the cost data should come from the task record itself (or be fetched in a batch query).

Simplest approach: The dashboard already has `TaskRecord` rows. We can add an optional `cost_cents` field to the pipeline display by enriching the task data. But we don't want to join execution_memory for every task on every poll.

More practical approach: The dashboard component receives cost data as a separate prop (a `Map<task_id, number>` of cost_cents), fetched once when the dashboard loads. Add `costMap?: Map<string, number>` to `PipelineTaskListProps`.

```tsx
export type PipelineTaskListProps = {
  rows: TaskRecord[];
  wPulse: number;
  wSt: number;
  wHb: number;
  wTm: number;
  wIdPipe: number;
  promptPipe: number;
  highlightTaskId?: string | null;
  showCost?: boolean;
  wCost?: number;
  costMap?: Map<string, number>;
};
```

In the render, after the topic/mode column and before task_id, add:

```tsx
            {showCost && wCost ? (
              <Box width={wCost} minWidth={wCost} overflow="hidden">
                <Text dimColor={rowDim && !sel} bold={sel} wrap="truncate-end">
                  {padCell(formatCostCents(costMap?.get(id) ?? 0), wCost)}
                </Text>
              </Box>
            ) : null}
```

Import `formatCostCents` from model-pricing.

- [ ] **Step 3: Run tests**

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/interfaces/cli/tui/task-dashboard/dashboard-layout.ts src/interfaces/cli/tui/task-dashboard/components/pipeline-task-list.tsx
git commit -m "feat: add opt-in cost column to dashboard (AGENT_FARM_DASHBOARD_COST=1)"
```

---

### Task 10: Integration — wire everything together and run final tests

**Files:**
- Modify: `src/domain/ports/repositories.ts` — ensure all new methods are declared
- (No additional files — just verification)

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

- [ ] **Step 2: Build check**

```bash
npm run build 2>&1 || npx tsc --noEmit
```

- [ ] **Step 3: Verify insights --cost works end-to-end**

```bash
agent-farm insights --cost --brief
```

Expected: "No cost data available." or actual cost data if execution_memory has records.

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final integration and test fixes for cost & token observability"
```
