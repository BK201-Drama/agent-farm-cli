type DispatchScriptOptions = {
  workers: number;
  commandTemplate?: string;
};

export function generateDispatchScript(options: DispatchScriptOptions): string {
  const { workers, commandTemplate } = options;
  const safeWorkers = Number.isFinite(workers) && workers > 0 ? Math.floor(workers) : 6;
  const escapedCommand = String(commandTemplate ?? "").replace(/'/g, "'\"'\"'");
  const useAutoDetect = !String(commandTemplate ?? "").trim();
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    'PROMPT="${1:-}"',
    'if [ -z "$PROMPT" ]; then',
    '  echo "Usage: ./scripts/agent-farm-dispatch.sh \\"task prompt\\"" >&2',
    "  exit 1",
    "fi",
    "",
    'TASK_ID="task-$(date +%s)"',
    'DEDUPE_KEY="manual:${TASK_ID}"',
    "",
    ...(useAutoDetect
      ? [
          "# Auto-detect available executor in current environment",
          'if command -v opencode >/dev/null 2>&1; then',
          "  EXECUTOR_COMMAND_TEMPLATE='opencode run --dir . --dangerously-skip-permissions {prompt}'",
          'elif command -v codex >/dev/null 2>&1; then',
          "  EXECUTOR_COMMAND_TEMPLATE='codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox {prompt}'",
          'elif command -v claude >/dev/null 2>&1; then',
          "  EXECUTOR_COMMAND_TEMPLATE='claude -p {prompt} --dangerously-skip-permissions'",
          "else",
          '  echo "No supported executor found. Install one of: opencode, codex, claude" >&2',
          "  exit 1",
          "fi",
          "",
        ]
      : [`EXECUTOR_COMMAND_TEMPLATE='${escapedCommand}'`, ""]),
    'agent-farm queue add --task-json "{\\"task_id\\":\\"${TASK_ID}\\",\\"mode\\":\\"execute\\",\\"prompt\\":\\"${PROMPT}\\",\\"dedupe_key\\":\\"${DEDUPE_KEY}\\"}"',
    "",
    "agent-farm worker \\",
    `  --workers ${safeWorkers} \\`,
    '  --command-template "${EXECUTOR_COMMAND_TEMPLATE}" \\',
    "  --lease-timeout-seconds 1800 \\",
    "  --poison-max-attempts 3",
    "",
    "agent-farm insights",
    "agent-farm doctor",
    "",
  ].join("\n");
}
