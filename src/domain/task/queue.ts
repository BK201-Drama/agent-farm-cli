import { ACTIVE_STATUSES, asTaskStatus, type JsonMap, type TaskRecord, type TaskStatus } from "../task.js";

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

/** 从当前行集合中 claim 最多 limit 条 queued/retry，返回更新后的行与快照 */
export function claimTasksFromRows(
  rows: TaskRecord[],
  limit: number,
  claimedAtIso: string
): { rows: TaskRecord[]; claimed: TaskRecord[] } {
  const next = rows.map((r) => ({ ...r }));
  const claimed: TaskRecord[] = [];
  for (const row of next) {
    if (claimed.length >= limit) break;
    if (!["queued", "retry"].includes(String(row.status))) continue;
    row.status = "claimed";
    row.claimed_at = claimedAtIso;
    claimed.push({ ...row });
  }
  return { rows: next, claimed };
}

/** 将超出租约的 running 任务回收为 retry */
export function recoverStaleInRows(
  rows: TaskRecord[],
  leaseTimeoutSeconds: number,
  nowMs: number,
  nowIsoStr: string
): { rows: TaskRecord[]; recoveredIds: string[] } {
  const next = rows.map((r) => ({ ...r }));
  const recovered: string[] = [];
  for (const row of next) {
    if (String(row.status) !== "running") continue;
    const t = Date.parse(String(row.heartbeat_at ?? row.started_at ?? ""));
    if (Number.isNaN(t)) continue;
    const age = (nowMs - t) / 1000;
    if (age < leaseTimeoutSeconds) continue;
    row.status = "retry";
    row.attempt = Number(row.attempt ?? 0) + 1;
    row.last_error = `lease timeout recovered after ${Math.floor(age)}s`;
    row.recovered_at = nowIsoStr;
    recovered.push(String(row.task_id));
  }
  return { rows: next, recoveredIds: recovered };
}

/** 将 poison 行从主队列拆出，准备写入隔离区 */
export function partitionPoisonQuarantine(
  rows: TaskRecord[],
  maxAttempts: number,
  blockedAtIso: string
): { keep: TaskRecord[]; blocked: TaskRecord[] } {
  const keep: TaskRecord[] = [];
  const blocked: TaskRecord[] = [];
  for (const row of rows) {
    const attempt = Number(row.attempt ?? 0);
    const status = String(row.status);
    if (["retry", "failed"].includes(status) && attempt >= maxAttempts) {
      blocked.push({
        ...row,
        status: "blocked",
        blocked_at: blockedAtIso,
        blocked_reason: `poison threshold reached: attempt=${attempt} >= ${maxAttempts}`,
      });
    } else {
      keep.push(row);
    }
  }
  return { keep, blocked };
}
