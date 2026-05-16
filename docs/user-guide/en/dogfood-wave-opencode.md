# Dogfood, waves & OpenCode

> Migrated from the root README; Chinese version: [../zh/dogfood-wave-opencode.md](../zh/dogfood-wave-opencode.md).

## Dogfood in this repository

This repo runs `project init` with **SQLite** (`npm run farm:init` uses `--storage sqlite`). Generated artifacts:

- `.agent-farm/config.json`, `.agent-farm/queue/agent_farm.db` (gitignored — do not commit runtime DB)
- `scripts/agent-farm-dispatch.sh` (prefers built `dist` CLI)
- `.cursor/skills/agent-farm-dispatch/SKILL.md`
- **Executor: OpenCode** via `opencode-ai` in `devDependencies`; dispatch uses  
  `npx --prefix="$AGENT_FARM_WORKSPACE_ROOT" opencode-ai run --pure --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions …`

Common scripts:

```bash
npm run build
npm run farm:dispatch -- "Your task"
npm run farm:insights
npm run farm:doctor
npm run farm:dashboard
```

**Windows**: use `npm run farm:dispatch:node -- "…"`. **Waves**: put JSON arrays under `.agent-farm/waves/`, then `npm run farm:wave -- path/to/wave.json` (or `node scripts/agent-farm-dispatch-batch.mjs …` without Bash). Items match `queue add --task-json` (at least `task_id`, `dedupe_key`, `prompt`). A copy-pasteable **team handoff** sample lives at **[`examples/waves/team-handoff-min.json`](../../../examples/waves/team-handoff-min.json)** (plan + execute); the inline JSON below is the shortest template.

### Minimal wave example

```json
[
  {
    "task_id": "task-a",
    "dedupe_key": "task-a",
    "mode": "execute",
    "prompt": "Implement feature and pass npm test"
  },
  {
    "task_id": "task-b",
    "dedupe_key": "task-b",
    "mode": "plan",
    "prompt": "Plan only, no code"
  }
]
```

### Enqueue vs consume

- **Enqueue**: `farm:wave` / `farm:dispatch:node` / `agent-farm queue add`
- **Consume**: `agent-farm worker` only dequeues; it does not enqueue
- **Dedupe**: same `dedupe_key` is not enqueued twice while active

### Playbook highlights

- Small waves (1–3 tasks), verify always on, `git pull` before large waves
- **Do not pipe** long `/execute` / `/verify` / `/ai-review` output through `head`/`tail`/`wc` — child may get **SIGPIPE**
- On `task_merge_failed`, follow recovery steps in [agent integration](./agent-integration.md)
- **Behavior regression** when changing personal/team/CI paths: run **`npm run test:bdd`** then `npm test`

### Resume after interruption

`./scripts/agent-farm-init-and-dispatch-batch.sh <wave.json>` runs `farm:init` then batch enqueue + worker.

### OpenCode & API keys

- Package: [`opencode-ai`](https://www.npmjs.com/package/opencode-ai); no global `opencode` on PATH required.
- Copy `scripts/agent-farm-profile.env.example` → `.agent-farm/profile.env`; set the same vendor keys you use in Cursor (e.g. `ANTHROPIC_API_KEY`). Dispatch scripts `source` this file before workers.
- **Parallel OpenCode**: batch/dispatch scripts pass **`--isolate-opencode-db`** (per-task `OPENCODE_DB` under `.agent-farm/opencode-db/`). For hand-rolled workers, add `--isolate-opencode-db` or `AGENT_FARM_ISOLATE_OPENCODE_DB=1`.

The `dashboard` / `ui` command uses **Ink + React**; run from the **repo root** that matches worker `--workspace`. `--opencode-feed` polls OpenCode sessions under the workspace (including worktrees).

Local CLI without global install: `npm run agent-farm -- queue list` (after `npm run build`). Re-run init: `npm run farm:init`.

→ [User guide index](../README.md) · Previous: [Install & quick start](./install-quickstart-commands.md) · Next: [Cursor & data paths](./cursor-data-state.md)
