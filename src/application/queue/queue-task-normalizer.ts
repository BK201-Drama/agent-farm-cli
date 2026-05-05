import { nowIso } from "../../infrastructure/persistence/jsonl/jsonl-utils.js";
import { ACTIVE_STATUSES, asTaskStatus, type JsonMap, type TaskRecord, type TaskStatus } from "../../domain/task.js";

export function normalizeQueuedTask(input: JsonMap): TaskRecord {
  const row: TaskRecord = {
    status: "queued",
    topic: "general",
    mode: "execute",
    created_at: nowIso(),
    started_at: null,
    ...input,
  };
  row.status = asTaskStatus(row.status, "queued");
  return row;
}

export function assertNoDuplicateDedupeKey(rows: TaskRecord[], dedupeKey: string): void {
  const normalized = dedupeKey.trim();
  if (!normalized) return;
  const dup = rows.some(
    (row) =>
      ACTIVE_STATUSES.has((row.status ?? "queued") as TaskStatus) &&
      String(row.dedupe_key ?? "").trim() === normalized
  );
  if (dup) throw new Error(`duplicate dedupe_key in active queue: ${normalized}`);
}
