# Cursor, data paths & state machine

> Migrated from the root README; Chinese version: [../zh/cursor-data-state.md](../zh/cursor-data-state.md).

## Cursor tips

1. Run `project init` for skill + dispatch script
2. Put conventions in `AGENTS.md` or Cursor rules: parallelizable work → agent-farm; tiny edits may stay inline
3. Cursor drafts waves; `agent-farm worker` only executes

Deeper collaboration copy lives under **[`../../agents/README.md`](../../agents/README.md)**.

## Default data paths

Under the current working directory:

- `.agent-farm/queue/tasks.jsonl`
- `.agent-farm/queue/events.jsonl`
- `.agent-farm/queue/quarantine_tasks.jsonl`

Override with per-command flags when needed.

## State machine

Happy path:

`queued/retry -> claimed -> running -> review -> approved -> done`

Other paths:

- Retry: `running -> retry`
- Poison: `retry/failed -> blocked`
- Crash / lease expiry: `running -> retry`

→ [User guide index](../README.md) · Previous: [Dogfood & waves](./dogfood-wave-opencode.md) · Next: [Integrating your agent](./agent-integration.md)
