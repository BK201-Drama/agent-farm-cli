import type { TaskRecord } from "../../../../domain/task.js";

export function isPipelineStatus(s: string): boolean {
  return ["queued", "retry", "claimed", "running", "review", "approved"].includes(s);
}

export function isHistoryStatus(s: string): boolean {
  return ["done", "failed", "cancelled", "blocked"].includes(s);
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

export function statusColor(st: string):
  | "white"
  | "gray"
  | "green"
  | "yellow"
  | "cyan"
  | "magenta"
  | "red"
  | "blue" {
  switch (st) {
    case "running":
      return "green";
    case "claimed":
      return "yellow";
    case "review":
      return "cyan";
    case "approved":
      return "blue";
    case "queued":
    case "retry":
      return "gray";
    case "done":
      return "green";
    case "failed":
      return "red";
    case "blocked":
    case "cancelled":
      return "red";
    default:
      return "white";
  }
}

export function padCell(s: string, w: number): string {
  const t = s.slice(0, w);
  return t.length >= w ? t : `${t}${" ".repeat(w - t.length)}`;
}

export function dimRule(len: number): string {
  const n = Math.min(Math.max(8, len), 200);
  return "─".repeat(n);
}

export function clipPrompt(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}
