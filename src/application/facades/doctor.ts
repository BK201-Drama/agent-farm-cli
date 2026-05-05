import type { JsonMap, TaskStatus } from "../../domain/task.js";
import { ACTIVE_STATUSES, TASK_STATUSES } from "../../domain/task.js";
import type { QuarantineRepository, TaskRepository } from "../../domain/ports/repositories.js";

export class DoctorService {
  constructor(private readonly taskRepo: TaskRepository, private readonly quarantineRepo: QuarantineRepository) {}

  async build(leaseTimeoutSeconds: number, reviewOverdueHours: number, topN: number): Promise<JsonMap> {
    const tasks = await this.taskRepo.list();
    const quarantine = await this.quarantineRepo.list();
    const now = Date.now();
    const staleRunning = tasks
      .filter((x) => String(x.status) === "running")
      .map((x) => {
        const t = Date.parse(String(x.heartbeat_at ?? x.started_at ?? ""));
        return { task_id: x.task_id, age_seconds: Number.isNaN(t) ? 0 : Math.floor((now - t) / 1000) };
      })
      .filter((x) => x.age_seconds >= leaseTimeoutSeconds);

    const dedupeMap: Record<string, string[]> = {};
    for (const task of tasks) {
      const rawStatus = String(task.status ?? "");
      if (!(TASK_STATUSES as readonly string[]).includes(rawStatus)) continue;
      if (!ACTIVE_STATUSES.has(rawStatus as TaskStatus)) continue;
      const key = String(task.dedupe_key ?? "").trim();
      if (!key) continue;
      dedupeMap[key] ??= [];
      dedupeMap[key].push(String(task.task_id));
    }
    const duplicateDedupeKeys = Object.entries(dedupeMap)
      .filter(([, ids]) => ids.length > 1)
      .map(([dedupe_key, task_ids]) => ({ dedupe_key, task_ids }));

    const reviewOverdue = tasks
      .filter((x) => String(x.status) === "review")
      .map((x) => {
        const t = Date.parse(String(x.review_requested_at ?? x.started_at ?? ""));
        return { task_id: x.task_id, age_hours: Number.isNaN(t) ? 0 : (now - t) / 3600000 };
      })
      .filter((x) => x.age_hours >= reviewOverdueHours)
      .map((x) => ({ ...x, age_hours: Number(x.age_hours.toFixed(2)) }));

    const failCounts: Record<string, number> = {};
    for (const t of tasks) {
      if (!["failed", "blocked", "retry"].includes(String(t.status))) continue;
      const reason = String(t.last_error ?? t.blocked_reason ?? "unknown").slice(0, 160);
      failCounts[reason] = (failCounts[reason] ?? 0) + 1;
    }
    const failureHotspots = Object.entries(failCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(topN, 1))
      .map(([reason, count]) => ({ reason, count }));

    return {
      ok: true,
      tasks_total: tasks.length,
      quarantine_total: quarantine.length,
      stale_running_count: staleRunning.length,
      stale_running: staleRunning,
      duplicate_dedupe_keys_count: duplicateDedupeKeys.length,
      duplicate_dedupe_keys: duplicateDedupeKeys,
      review_overdue_count: reviewOverdue.length,
      review_overdue: reviewOverdue,
      failure_hotspots: failureHotspots,
    };
  }
}
