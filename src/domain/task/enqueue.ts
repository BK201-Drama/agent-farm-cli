import { ACTIVE_STATUSES, asTaskStatus, type JsonMap, type TaskRecord, type TaskStatus } from "./model.js";

/**
 * 将入参规范为可入队的任务行（领域规则：默认状态/模式/topic；时间由调用方注入，避免领域依赖基础设施时钟）。
 */
export function normalizeQueuedTask(input: JsonMap, createdAtIso: string): TaskRecord {
  const row: TaskRecord = {
    status: "queued",
    topic: "general",
    mode: "execute",
    created_at: createdAtIso,
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
