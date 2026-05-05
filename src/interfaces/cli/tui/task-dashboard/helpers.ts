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

function rowSig(t: TaskRecord): string {
  const u = (t as Record<string, unknown>).updated_at ?? (t as Record<string, unknown>).created_at ?? "";
  const p = String(t.prompt ?? "").slice(0, 80);
  return `${String(t.task_id)}:${String(t.status)}:${String(u)}:${p}`;
}

/** 用于轮询后跳过无意义的 setState */
export function tasksFingerprint(rows: TaskRecord[]): string {
  return [...rows]
    .map(rowSig)
    .sort()
    .join("\n");
}

/** 列表过滤：task_id / prompt 子串（忽略大小写） */
export function filterTasksByQuery(rows: TaskRecord[], q: string): TaskRecord[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => {
    const id = String(row.task_id ?? "").toLowerCase();
    const pr = String(row.prompt ?? "").toLowerCase();
    return id.includes(needle) || pr.includes(needle);
  });
}

/** 管线内各状态计数，用于副标题一行 */
export function pipelineStatusSummary(pipe: TaskRecord[]): string {
  const counts = new Map<string, number>();
  for (const t of pipe) {
    const s = String(t.status ?? "queued");
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const parts = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([s, n]) => `${s.slice(0, 4)}×${n}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/** 相对时间简写（列宽友好） */
export function relativeShort(iso: string | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

export type DashboardTheme = "dark" | "light";

export function pipelineBorderColor(theme: DashboardTheme): "cyan" | "magenta" {
  return theme === "light" ? "magenta" : "cyan";
}

export function historyBorderColor(theme: DashboardTheme): "blue" | "gray" {
  return theme === "light" ? "gray" : "blue";
}

export function clampViewport(
  cursor: number,
  scroll: number,
  len: number,
  view: number,
): { cursor: number; scroll: number } {
  if (len <= 0) return { cursor: 0, scroll: 0 };
  let c = Math.max(0, Math.min(len - 1, cursor));
  let s = Math.max(0, Math.min(scroll, Math.max(0, len - view)));
  if (c < s) s = c;
  if (c >= s + view) s = c - view + 1;
  s = Math.max(0, Math.min(s, Math.max(0, len - view)));
  return { cursor: c, scroll: s };
}

