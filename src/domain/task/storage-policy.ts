import type { AgentFarmStorageKind } from "./queue-workspace-paths.js";

let jsonlWarned = false;

/** JSONL 仅适合单 worker 调试；多 worker 请用 SQLite（默认）。 */
export function warnJsonlStorageIfNeeded(storage: AgentFarmStorageKind): void {
  if (storage !== "jsonl" || jsonlWarned) return;
  jsonlWarned = true;
  console.warn(
    "[agent-farm] AGENT_FARM_STORAGE=jsonl is legacy/debug-only (no safe multi-worker). Prefer sqlite (default) or --workers 1.",
  );
}

/** 测试用 */
export function resetJsonlStorageWarnForTests(): void {
  jsonlWarned = false;
}
