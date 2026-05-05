import type { TaskRecord } from "./model.js";

export function isPipelineStatus(s: string): boolean {
  return ["queued", "retry", "claimed", "running", "review", "approved"].includes(s);
}

export function isHistoryStatus(s: string): boolean {
  return ["done", "failed", "cancelled", "blocked", "rejected"].includes(s);
}

function pipelineRank(st: string): number {
  const m: Record<string, number> = {
    running: 0,
    claimed: 1,
    review: 2,
    approved: 3,
    queued: 4,
    retry: 5,
  };
  return m[st] ?? 99;
}

export function sortPipeline(a: TaskRecord, b: TaskRecord): number {
  const sa = String(a.status ?? "queued");
  const sb = String(b.status ?? "queued");
  const ra = pipelineRank(sa);
  const rb = pipelineRank(sb);
  if (ra !== rb) return ra - rb;
  const ta = String(a.heartbeat_at ?? a.started_at ?? a.claimed_at ?? a.created_at ?? "");
  const tb = String(b.heartbeat_at ?? b.started_at ?? b.claimed_at ?? b.created_at ?? "");
  return tb.localeCompare(ta);
}

export function sortHistory(a: TaskRecord, b: TaskRecord): number {
  const ta = String(a.completed_at ?? a.updated_at ?? a.created_at ?? "");
  const tb = String(b.completed_at ?? b.updated_at ?? b.created_at ?? "");
  return tb.localeCompare(ta);
}

/** 看板 / 快照共用：拆成管线与归档并已排序 */
export function partitionSortedTasks(tasks: TaskRecord[]): { pipeline: TaskRecord[]; history: TaskRecord[] } {
  const pipeline = tasks.filter((t) => isPipelineStatus(String(t.status ?? "queued")));
  pipeline.sort(sortPipeline);
  const history = tasks.filter((t) => isHistoryStatus(String(t.status ?? "")));
  history.sort(sortHistory);
  return { pipeline, history };
}

export function countUnpartitionedTasks(
  tasks: TaskRecord[],
  pipeline: TaskRecord[],
  history: TaskRecord[]
): number {
  return Math.max(0, tasks.length - pipeline.length - history.length);
}
