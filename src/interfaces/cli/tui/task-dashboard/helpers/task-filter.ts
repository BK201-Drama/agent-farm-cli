import type { TaskRecord } from "../../../../../domain/task.js";
import { stuckRiskBadgeFromTasks } from "../../../../../application/facades/stuck-report.js";

/** 列表过滤：id / prompt / topic / dedupe / status 子串（忽略大小写） */
export function filterTasksByQuery(rows: TaskRecord[], q: string): TaskRecord[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => {
    const id = String(row.task_id ?? "").toLowerCase();
    const pr = String(row.prompt ?? "").toLowerCase();
    const topic = String(row.topic ?? "").toLowerCase();
    const dedupe = String(row.dedupe_key ?? "").toLowerCase();
    const st = String(row.status ?? "").toLowerCase();
    const priRaw = (row as Record<string, unknown>).priority;
    const pri = priRaw !== undefined && priRaw !== null ? String(priRaw).toLowerCase() : "";
    return (
      id.includes(needle) ||
      pr.includes(needle) ||
      topic.includes(needle) ||
      dedupe.includes(needle) ||
      st.includes(needle) ||
      (pri.length > 0 && pri.includes(needle))
    );
  });
}

/** 管线内各状态计数，用于副标题一行 */
export function pipelineStatusSummary(pipe: TaskRecord[]): string {
  const counts = new Map<string, number>();
  for (const t of pipe) {
    const s = String(t.status ?? "queued");
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const parts = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([s, n]) => `${s.slice(0, 4)}×${n}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/** 顶栏：全量状态计数紧凑串 que3·run1·don5 */
export function compactStatusBar(tasks: TaskRecord[], leaseTimeoutSeconds = 1800): string {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    const s = String(t.status ?? "?");
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const parts = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([s, n]) => `${s.slice(0, 3)}${n}`);
  const base = parts.length > 0 ? parts.join("·") : "—";
  const stuck = stuckRiskBadgeFromTasks(tasks, leaseTimeoutSeconds);
  return stuck ? `${base} ${stuck}` : base;
}
