# agent-farm-cli

TypeScript CLI for running queue-driven parallel agent workflows.

## Install

```bash
npm install -g agent-farm-cli
```

## Build (local)

```bash
npm install
npm run build
```

## Commands

- `agent-farm queue add --task-json '{"task_id":"t1","prompt":"do x"}'`
- `agent-farm queue list`
- `agent-farm queue claim --limit 2`
- `agent-farm queue update --task-id t1 --status running`
- `agent-farm queue review-approve --task-id t1 --spawn-execute`
- `agent-farm queue review-reject --task-id t1 --move-to-retry --reason "missing test"`
- `agent-farm queue recover-stale --lease-timeout-seconds 1800`
- `agent-farm queue quarantine-poison --max-attempts 3`
- `agent-farm worker --workers 2 --command-template 'echo {prompt}' --auto-approve-review`
- `agent-farm insights --top-n 5`
- `agent-farm doctor --review-overdue-hours 2`

## Data files

Default queue files are stored under current working directory:

- `.agent-farm/queue/tasks.jsonl`
- `.agent-farm/queue/events.jsonl`
- `.agent-farm/queue/quarantine_tasks.jsonl`
