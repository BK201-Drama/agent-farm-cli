# Install, quick start & command overview

> Migrated from the root README; Chinese version: [../zh/install-quickstart-commands.md](../zh/install-quickstart-commands.md).

## Goals

- **Portable**: Node.js only; works in any repo
- **Parallel**: multiple workers consuming the queue
- **Recoverable**: stale `running` reclaimed; poison tasks quarantined
- **Governable**: state machine, review gate, dedupe keys

## Install

### Option A — global from GitHub

```bash
npm i -g github:BK201-Drama/agent-farm-cli
```

### Option B — local dev

```bash
npm install
npm run build
npm link
```

Then:

```bash
agent-farm --help
```

## Quick start (~3 minutes)

```bash
agent-farm queue add --prompt "Implement login API" --task-id t1 --dedupe-key auth-login
agent-farm queue add --task-json '{"task_id":"t2","prompt":"Add login tests","mode":"execute","dedupe_key":"auth-test"}'

agent-farm worker --workers 2 --command-template 'echo {prompt}'

agent-farm insights
agent-farm doctor
```

## Personal 5-minute checklist (first run)

Check off in order to connect **personal → team → CI** (full table: **[one-week roadmap](../../roadmap-one-week-personal-team-ci.md)**).

| Step | Command / action | Expected |
|------|------------------|----------|
| 1 Install | `npm i -g github:BK201-Drama/agent-farm-cli` or clone + `npm install && npm run build && npm link` | `agent-farm --help` works |
| 2 Init | `agent-farm project init --target-dir .` (skip if already initialized) | `.agent-farm/queue/` exists |
| 3 Demo enqueue | `agent-farm demo task --template noop` | stdout contains `demo-onboarding-` and `"ok": true` |
| 4 Health gate | `agent-farm doctor --ci-exit` | **exit code 0** on empty/healthy queue |
| 5 Inspect queue | `agent-farm dashboard --plain` or `agent-farm queue list` | See the demo task or an empty queue |
| 6 Local CI parity | In this repo clone: `npm run ci:health:local` | prints `ci-health-local: ok` |

**Team (+5 min)**: Copy **`examples/waves/team-handoff-min.json`** into `.agent-farm/waves/`, edit `task_id`, then `npm run farm:wave -- .agent-farm/waves/your-file.json` (see **[Async collaboration & wave handoff](./collaboration-async-handoff.md)**).

**CI**: Enable **`.github/workflows/agent-farm-health-cron.yml`** after fork; **Run workflow** in Actions. Failures open/update an issue (**[GitHub Actions health](../../integrations/github-actions-health.md)**).

## Bootstrap a consumer repo

```bash
agent-farm project init --target-dir .
```

Creates `.agent-farm/queue/`, installs the Cursor skill, and generates `scripts/agent-farm-dispatch.sh`. Then:

```bash
./scripts/agent-farm-dispatch.sh "Implement registration with tests"
```

## Command overview

### Queue

`queue add`, `list`, `claim`, `update`, `review-approve`, `review-reject`, `recover-stale`, `quarantine-poison`, `batch-cancel` — see `agent-farm queue --help`.

### Dashboard (`ui`)

Full-screen TUI for pipeline + history; `--task-file`, `--refresh-ms` (min 200).

**Cold start:** Ink/React for the dashboard are loaded with a dynamic `import()` only when you run `dashboard` / `ui`. Commands such as `queue`, `doctor`, and `worker` do not eagerly pull the TUI graph (see **`docs/agents/source-layout.md`** for contributors).

### Worker

Parallel execution with lease recovery, poison quarantine, optional auto-approve to `done`.

### Observability

`insights` (status mix, failure hotspots, duration) and `doctor` (health checks).

### Skill

`skill install` writes `.cursor/skills/agent-farm-dispatch/SKILL.md` (use `--force` to overwrite).

### `project init`

Creates queue storage, skill, dispatch script; executor presets `auto|opencode|codex|claude` or `--executor-command '…{prompt}…'`.

→ [User guide index](../README.md) · Next: [Dogfood, waves & OpenCode](./dogfood-wave-opencode.md)
