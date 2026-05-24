# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

```bash
npm run build          # clean dist/ → tsc → copy panel assets
npm run dev            # tsx direct run of CLI entry point (no build needed)
npm run check          # tsc --noEmit (type-check only)
npm run lint           # eslint . (warnings only; errors: no-var, no-empty w/o comment)
npm run lint:fix       # eslint --fix .
npm run format         # prettier --write .
npm run format:check   # prettier --check .

npm test               # vitest run (unit/integration under test/)
npm run test:bdd       # vitest run test/bdd (BDD acceptance tests)
npm run test:watch     # vitest (watch mode)

npm run validate:waves                  # validate all wave JSON files
npm run validate:waves:strict           # strict prompt lint on waves
npm run validate:waves:strict:examples  # strict lint on examples/waves only
npm run validate:reports                # validate node stage reports

npm run ci:health:local  # full local CI health check (doctor --ci-exit + demo task etc.)
```

**Run a single test file:**

```bash
npx vitest run test/path/to/file.test.ts
```

**Prepublish gate** runs: `check → validate:waves → validate:waves:strict:examples → test → test:bdd → build → ci:health:local`.

## Architecture

Clean/hexagonal architecture with strict layer separation:

| Layer | Directory | Role |
|-------|-----------|------|
| Domain | `src/domain/` | Task model, status transitions, enqueue rules, domain ports (repositories, clock, shell-runner) |
| Application | `src/application/` | Use cases, facades (QueueService, InsightsService, DoctorService), worker pipeline, public-api |
| Infrastructure | `src/infrastructure/` | Persistence (SQLite/JSONL), clock, git, process exec, OpenCode/Cursor SDK, project init |
| Interfaces | `src/interfaces/` | CLI (Commander), MCP server, control-plane HTTP server, TUI (Ink/React) |
| Ports | `src/ports/` | Deprecated — domain ports live in `src/domain/ports/`, app contracts in `src/application/contracts/` |
| Bootstrap | `src/bootstrap/` | `container.ts` wires repos + services; `default-storage-container.ts` resolves paths from cwd |

**Storage**: SQLite (default) via `better-sqlite3` at `.agent-farm/queue/agent_farm.db`. JSONL fallback available. **Never** use `sqlite3` CLI or other tools directly on the queue DB — always go through `agent-farm queue ...` / `doctor` / `dashboard` commands.

**Container bootstrap** (`src/bootstrap/container.ts`): `createContainer(paths)` instantiates repos (SqliteTaskRepository or JsonlTaskRepository) and facade services (QueueService, InsightsService, DoctorService, StatusService). CLI commands call `createCliQueueContainer()` which layers on CLI defaults.

### Task lifecycle (state machine)

```
queued → claimed → running → review → approved → done
  ↓        ↓         ↓          ↓
retry ← ← ← ← ← ← ← ← ← ← rejected
  ↓        ↓         ↓
failed   blocked   cancelled
```

Transitions enforced in `src/domain/task/transitions.ts`. Only allowed transitions can be written; `recover-stale` returns claimed→retry, `quarantine-poison` limits retries.

### Worker pipeline

`src/application/worker/process-claimed-task/index.ts` orchestrates per-task execution:
1. **Claim** task from queue
2. **Create git worktree** (branch `agent-farm/<task_id>`) — isolated workspace per task
3. **Execute** stage (`stage-execute.ts`) — run command template
4. **Verify** stage (`stage-verify.ts`) — deterministic checks (tests/lint)
5. **AI review** stage (`stage-ai-review.ts`) — optional semantic review, injects `[ai-review-fix]` on retry
6. **Snapshot commit** + optional auto-merge back to base branch

`mode=plan` tasks produce proposals for human review; `mode=execute` tasks produce code changes.

### CLI structure

- Entry: `src/interfaces/cli/index.ts` — Commander program
- All subcommands registered via `src/interfaces/cli/register/index.ts`
- Lazy loading: dashboard TUI, project init, doctor action, skill install all use dynamic `import()` to avoid bloating cold-start dependency graph
- `src/interfaces/cli/register/queue/` split by subcommand (add, list, show, claim, review-approve, etc.)
- TUI dashboard built with Ink + React (`src/interfaces/cli/tui/task-dashboard/`)

### Key concepts

- **dedupe_key**: Stable key per intent (e.g. `auth-login`); prevents duplicate task enqueue
- **Wave**: JSON array of task objects batched for dispatch (see `examples/waves/`)
- **Worktree isolation**: Each task runs in its own `git worktree`; merge via `--auto-merge`
- **Placeholder expansion**: `{prompt}`, `{task_id}`, `{workspace}`, `{runs_dir}`, `{acceptance_criteria}`, `{git_diff}`, `{git_diff_name_status}` available in command templates
- **Empty-run detection**: Worker aborts tasks with no file changes after 10 min grace period, auto-retries once with `[empty-run-fix]`

### Public API (`agent-farm-cli/core`)

Exported from `src/application/public-api.ts`. Stable embedding surface for consumers. Includes `createContainer`, `ControlPlaneService`, `buildStuckReport`, wave validation, executor factories, M4+ multi-model routing.

### Config & env

- `.agent-farm/profile.env` — API keys per executor (template at `scripts/agent-farm-profile.env.example`)
- `.agent-farm/config.json` — project-level empty-run, auto-merge, executor settings
- `AGENT_FARM_STORAGE` — `sqlite` (default) or `jsonl`
- `AGENT_FARM_GIT_WORKTREE=0` — disable worktree isolation for shared-workspace mode
- `AGENT_FARM_EMPTY_RUN_GRACE_MINUTES` — override empty-run timeout

### Schemas

- `schemas/wave-task-item.schema.json` — JSON Schema (Draft 2020-12) for wave task items
- `schemas/node-stage-report.schema.json` — execute stage report format

### Executor adapters

Pluggable executor architecture (ADR-001):
- **OpenCode** (`src/infrastructure/opencode/`) — the default worker executor
- **Cursor SDK** (`src/infrastructure/executors/cursor-sdk-executor.ts`) — optional peer dependency
- **Shell template** (`shell-template-executor.ts`) — generic command-template based executor
