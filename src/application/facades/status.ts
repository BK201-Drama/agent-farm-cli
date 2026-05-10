import type { JsonMap } from "../../domain/task.js";
import type { TaskRepository } from "../../domain/ports/repositories.js";

export class StatusService {
  constructor(private readonly taskRepo: TaskRepository) {}

  async build(topN: number): Promise<JsonMap> {
    const tasks = await this.taskRepo.list();

    const statusCounts: Record<string, number> = {};
    for (const t of tasks) {
      const s = String(t.status ?? "unknown");
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }

    const failureCounts: Record<string, number> = {};
    for (const t of tasks) {
      if (!["failed", "blocked", "retry"].includes(String(t.status))) continue;
      const reason = String(t.last_error ?? t.blocked_reason ?? "unknown").slice(0, 160);
      failureCounts[reason] = (failureCounts[reason] ?? 0) + 1;
    }
    const failureHotspots = Object.entries(failureCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(topN, 1))
      .map(([reason, count]) => ({ reason, count }));

    return {
      ok: true,
      tasks_total: tasks.length,
      status_counts: statusCounts,
      failure_hotspots: failureHotspots,
    };
  }
}
