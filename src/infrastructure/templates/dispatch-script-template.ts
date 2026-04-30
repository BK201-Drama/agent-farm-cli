export function generateDispatchScript(commandTemplate: string, workers: number): string {
  const safeWorkers = Number.isFinite(workers) && workers > 0 ? Math.floor(workers) : 6;
  const escapedCommand = commandTemplate.replace(/'/g, "'\"'\"'");
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
    'agent-farm queue add --task-json "{\\"task_id\\":\\"${TASK_ID}\\",\\"mode\\":\\"execute\\",\\"prompt\\":\\"${PROMPT}\\",\\"dedupe_key\\":\\"${DEDUPE_KEY}\\"}"',
    "",
    "agent-farm worker \\",
    `  --workers ${safeWorkers} \\`,
    `  --command-template '${escapedCommand}' \\`,
    "  --lease-timeout-seconds 1800 \\",
    "  --poison-max-attempts 3",
    "",
    "agent-farm insights",
    "agent-farm doctor",
    "",
  ].join("\n");
}
