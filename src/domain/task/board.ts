import type { TaskRecord } from "./model.js";

function claimPriority(row: TaskRecord): number {
  return Number(row.priority ?? 0);
}

/** 从当前行集合中 claim 最多 limit 条 queued/retry（按 priority 降序、created_at 升序），返回更新后的行与快照 */
export function claimTasksFromRows(
  rows: TaskRecord[],
  limit: number,
  claimedAtIso: string,
  claimant: string
): { rows: TaskRecord[]; claimed: TaskRecord[] } {
  const next = rows.map((r) => ({ ...r }));
  const indices: number[] = [];
  for (let i = 0; i < next.length; i++) {
    if (["queued", "retry"].includes(String(next[i]!.status))) indices.push(i);
  }
  indices.sort((ia, ib) => {
    const pa = claimPriority(next[ia]!);
    const pb = claimPriority(next[ib]!);
    if (pa !== pb) return pb - pa;
    const ca = String(next[ia]!.created_at ?? "");
    const cb = String(next[ib]!.created_at ?? "");
    return ca.localeCompare(cb);
  });
  const claimed: TaskRecord[] = [];
  for (const i of indices) {
    if (claimed.length >= limit) break;
    const row = next[i]!;
    row.status = "claimed";
    row.claimed_at = claimedAtIso;
    row.claimed_by = claimant;
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
