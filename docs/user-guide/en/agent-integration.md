# Integrating your own agent

> Migrated from the root README; Chinese version: [../zh/agent-integration.md](../zh/agent-integration.md).

Everything hinges on **`--command-template`** (and optional verify / AI-review templates).

```bash
agent-farm worker \
  --workers 3 \
  --command-template 'your-agent-cli run --task-id {task_id} --prompt {prompt} --out {runs_dir}' \
  --lease-timeout-seconds 1800 \
  --poison-max-attempts 3
```

## Placeholders

`{task_id}`, `{prompt}`, `{runs_dir}`, `{workspace}` (per-task checkout: isolated **git worktree** by default; equals `--workspace` with `--shared-workspace`), `{acceptance_criteria}`, `{git_diff}`, `{git_diff_name_status}` (git diff snippets, JSON-escaped, size-capped — see source `git-context.ts` for exact limits).

Child env includes `AGENT_FARM_TASK_ID`, `AGENT_FARM_RUNS_DIR`, `AGENT_FARM_WORKSPACE`, `AGENT_FARM_WORKSPACE_ROOT` (repo root with `node_modules/.bin` for `npx --prefix`), `AGENT_FARM_PROMPT`, and `AGENT_FARM_WORKTREE_BRANCH` when worktrees are enabled.

## Git worktrees (default on)

Each task gets **`<repo>/.agent-farm/worktrees/<task-id>`** on branch **`agent-farm/<task-id>`** from a clean `HEAD`. Directory is removed after the task; **branch remains**. Requires git repo at `--workspace`. Disable with **`--shared-workspace`** or `AGENT_FARM_GIT_WORKTREE=0`.

OpenCode example (prefix vs cwd):

`npx --prefix="$AGENT_FARM_WORKSPACE_ROOT" opencode-ai run --pure --dir "$AGENT_FARM_WORKSPACE" --dangerously-skip-permissions {prompt}`

Snapshot commit before worktree removal (runs under `.agent-farm/runs` force-added by default), optional auto-merge to current branch (`--auto-merge` / `AGENT_FARM_AUTO_MERGE=1`), stash/pop around dirty trees — full matrix of env vars (`AGENT_FARM_WORKTREE_SNAPSHOT_*`, `AGENT_FARM_AUTO_MERGE_STASH`, etc.) matches the Chinese guide paragraph-for-paragraph; on conflicts follow **`task_merge_failed`** recovery (doctor, `queue recover-stale`, merge/abort, `queue update`).

## OpenCode NDJSON (`--opencode-json-events`)

When the expanded command contains `opencode-ai run`, worker may inject `--format json` and parse NDJSON for heal hints (`[opencode-heal]`) and `task_opencode_stream_diag` events. Enable with **`--opencode-json-events`** or `AGENT_FARM_OPENCODE_JSON_EVENTS=1`.

## Verify (deterministic)

Pipeline: **execute → verify → ai-review → review**. `--verify-command-template` runs after execute; non-zero → `retry`. Skipped if template empty. Per-task override: task field **`verify_command_template`**.

Wave field matrix & JSON Schema: **`docs/harness-contracts.md`** and `schemas/wave-task-item.schema.json`.

## AI review (semantic)

After verify, `--ai-review-command-template` (or per-task `ai_review_command_template`); `--require-ai-review` blocks tasks without a template unless `skip_ai_review: true`. Failures append **`[ai-review-fix]`** to `prompt`.

Windows: use `scripts\ai-review.example.cmd` instead of `.sh`.

### Verdict JSON

If the **last non-empty line** of combined stdout is `{"verdict":"pass"}` or `{"verdict":"fail","reason":"…"}`, that verdict overrides the process exit code for the stage. Otherwise behavior is exit-code-only.

## Executor presets

`project init --executor auto|opencode|codex|claude` or `--executor-command '…'`. `auto` probes `opencode → codex → claude` at init and again in generated `agent-farm-dispatch.sh`.

```bash
agent-farm skill install --target-dir .
agent-farm project init --target-dir .
./scripts/agent-farm-dispatch.sh "Your task"
```

→ [User guide index](../README.md) · Previous: [Cursor & data](./cursor-data-state.md) · Next: [FAQ & architecture](./faq-publish-architecture.md)
