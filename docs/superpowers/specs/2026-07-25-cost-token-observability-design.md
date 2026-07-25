# Cost & Token Observability Design

**Issue:** OPC-6
**Date:** 2026-07-25
**Status:** approved

## Scope

Implement model-level cost tracking and visualization for agent-farm-cli, making multi-model routing measurable.

## Layers

### 1. Token Extraction from NDJSON Streams

Enhance `OpencodeStreamSummary` and `ClaudeCodeStreamSummary` to capture cumulative token usage.

- OpenCode `type: "result"` events: `usage.input_tokens`, `usage.output_tokens`
- Claude Code `type: "result"` events: `usage.input_tokens`, `usage.output_tokens`
- Add `inputTokens` / `outputTokens` fields, accumulated across all result events in a stream
- The `AgentStreamSummary` interface gains `inputTokens?: number` and `outputTokens?: number`

**Files:** `src/infrastructure/opencode/opencode-json-stream.ts`, `src/infrastructure/claude-code/claude-code-json-stream.ts`, `src/domain/ports/agent-stream-observer.ts`

### 2. Persist Token Data in Execution Memory

Add columns to `execution_memory` table and `ExecutionMemoryRecord`:

- `input_tokens` INTEGER (cumulative)
- `output_tokens` INTEGER (cumulative)
- `cost_cents` INTEGER (computed: input_tokens * input_price + output_tokens * output_price, in USD cents)

Cost computed at insert time for queryability.

**Files:** `src/domain/execution-memory/model.ts`, `src/infrastructure/persistence/sqlite/execution-memory.ts`, `src/infrastructure/persistence/sqlite/db.ts`, `src/application/worker/execution-memory-recorder.ts`

### 3. Model Pricing

Hardcoded default price table with env var override.

```ts
// Prices per 1M tokens in USD
DEFAULT_MODEL_PRICES: Record<string, { input: number; output: number }>
```

Env override: `AGENT_FARM_MODEL_PRICES='{"model-name":{"input":15,"output":75}}'`

Price resolution: try env override → fall back to hardcoded table → default to 0 (free tier / unknown model).

**New file:** `src/application/executors/model-pricing.ts`

### 4. Insights `--cost` View

Add `--cost` flag to `agent-farm insights`. When set:

- By `task_type`: total cost, tokens, count per type
- By `model`: total cost, tokens, count per model
- By wave (dedupe_key prefix): cost per wave
- Overall total spend

Output as JSON (default) or brief table via `--brief`.

New method on `InsightsService`: `buildCostReport()` → queries `execution_memory` with aggregations.

**Files:** `src/application/facades/insights.ts`, `src/interfaces/cli/register/insights.ts`, `src/domain/ports/repositories.ts`

### 5. Dashboard Cost Column

Opt-in cost column in pipeline view. Controlled by `AGENT_FARM_DASHBOARD_COST=1`.

Shows cost for done/failed tasks (from execution_memory join). Width ~6 chars ("$0.042").

**Files:** `src/interfaces/cli/tui/task-dashboard/dashboard-layout.ts`, pipeline-task-list component, dashboard query logic

### 6. Cost Anomaly Detection

Extend insights: when a task's token consumption exceeds 2× the moving average for same task_type + model, mark `[cost-anomaly]` in the insights output.

Implemented as a new query in `ExecutionMemoryRepository` that compares recent tasks against historical averages.

**Files:** `src/application/facades/insights.ts`, `src/infrastructure/persistence/sqlite/execution-memory.ts`

## Data Flow

```
NDJSON stdout ──→ Observer.onStdoutLine() ──→ Summary.inputTokens/outputTokens
                                                    │
ShellRunner result ──→ streamObs.snapshot() ──→ recordExecutionMemory()
                                                    │
                                              ExecutionMemoryRecord
                                              (input_tokens, output_tokens, cost_cents)
                                                    │
                                              SQLite execution_memory
                                                    │
                    ┌───────────────────────────────┼───────────────────────┐
                    │                               │                       │
              insights --cost               Dashboard cost col       Cost anomaly check
```

## Non-Goals

- Real-time pricing API calls (prices are preset)
- Per-user billing (this is observability, not metering)
- Token tracking for non-NDJSON executors (cursor-sdk, plain shell)
- Dashboard cost for pipeline tasks still in progress (cost only shown when done/failed)

## Migration

Add `input_tokens`, `output_tokens`, `cost_cents` columns to existing `execution_memory` table with `ALTER TABLE ADD COLUMN` (SQLite compatible, defaults NULL for historical rows).
