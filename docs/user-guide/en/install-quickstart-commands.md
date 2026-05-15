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

### Worker

Parallel execution with lease recovery, poison quarantine, optional auto-approve to `done`.

### Observability

`insights` (status mix, failure hotspots, duration) and `doctor` (health checks).

### Skill

`skill install` writes `.cursor/skills/agent-farm-dispatch/SKILL.md` (use `--force` to overwrite).

### `project init`

Creates queue storage, skill, dispatch script; executor presets `auto|opencode|codex|claude` or `--executor-command '…{prompt}…'`.

→ [User guide index](../README.md) · Next: [Dogfood, waves & OpenCode](./dogfood-wave-opencode.md)
