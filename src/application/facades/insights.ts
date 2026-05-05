import type { EventRecord } from "../../domain/event.js";
import type { JsonMap } from "../../domain/task.js";
import {
  countUnpartitionedTasks,
  partitionSortedTasks,
} from "../../domain/task/pipeline-partition.js";
import type { EventRepository, TaskRepository } from "../../domain/ports/repositories.js";

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
}

export class InsightsService {
  constructor(private readonly taskRepo: TaskRepository, private readonly eventRepo: EventRepository) {}

  async build(topN: number): Promise<JsonMap> {
    const tasks = await this.taskRepo.list();
    const events = await this.eventRepo.list();
    const statusCounts: Record<string, number> = {};
    for (const t of tasks) {
      const s = String(t.status ?? "unknown");
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }
    const failureCounts: Record<string, number> = {};
    for (const t of tasks) {
      if (!["failed", "blocked", "retry"].includes(String(t.status ?? ""))) continue;
      const reason = String(t.last_error ?? t.blocked_reason ?? "unknown").slice(0, 160);
      failureCounts[reason] = (failureCounts[reason] ?? 0) + 1;
    }
    const starts: Record<string, number> = {};
    const durations: number[] = [];
    for (const ev of events) {
      const taskId = String(ev.task_id ?? "");
      const ts = Date.parse(String(ev.ts ?? ""));
      if (!taskId || Number.isNaN(ts)) continue;
      if (String(ev.event) === "task_running") starts[taskId] = ts;
      if (["task_done", "task_failed"].includes(String(ev.event)) && starts[taskId]) {
        durations.push((ts - starts[taskId]) / 1000);
        delete starts[taskId];
      }
    }
    const failureTop = Object.entries(failureCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(topN, 1))
      .map(([error, count]) => ({ error, count }));
    return {
      ok: true,
      tasks_total: tasks.length,
      events_total: events.length,
      status_counts: statusCounts,
      failure_top: failureTop,
      duration_summary: {
        count: durations.length,
        avg_sec: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
        p50_sec: percentile(durations, 0.5),
        p95_sec: percentile(durations, 0.95),
        max_sec: durations.length ? Math.max(...durations) : 0,
      },
    };
  }

  /** 看板同源分区：一次 JSON 快照（供 `queue snapshot` / 脚本）。 */
  async buildBoardSnapshot(): Promise<JsonMap> {
    const tasks = await this.taskRepo.list();
    const { pipeline, history } = partitionSortedTasks(tasks);
    const other = countUnpartitionedTasks(tasks, pipeline, history);
    return {
      ok: true,
      tasks_total: tasks.length,
      pipeline,
      history,
      other_status_count: other,
    };
  }

  /** 队列 + 事件全量导出（脱敏由调用方负责）。 */
  async buildExportDump(): Promise<JsonMap> {
    const tasks = await this.taskRepo.list();
    const events = await this.eventRepo.list();
    return { ok: true, tasks, events };
  }

  async listRecentEvents(limit: number): Promise<EventRecord[]> {
    const events = await this.eventRepo.list();
    const n = Math.max(1, Math.floor(limit));
    return events.slice(-n);
  }
}
