import type { EventRecord } from "../../domain/event.js";
import type { JsonMap } from "../../domain/task.js";
import { countUnpartitionedTasks, partitionSortedTasks } from "../../domain/task/pipeline-partition.js";
import type { EventRepository, ExecutionMemoryRepository, TaskRepository } from "../../domain/ports/repositories.js";
import type { GitWorkspacePort } from "../contracts/git-workspace.js";
import { runResourceLeakScan } from "../resource-leak-scanner.js";

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
}

export class InsightsService {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly eventRepo: EventRepository,
    private readonly gitWorkspace: GitWorkspacePort,
    private readonly executionMemoryRepo?: ExecutionMemoryRepository,
  ) {}

  async build(
    topN: number,
    gitTop?: string | null,
    worktreeBasePath?: string | null,
  ): Promise<JsonMap> {
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
    const resourceLeak =
      gitTop != null || worktreeBasePath != null
        ? runResourceLeakScan({
            gitTop: gitTop ?? null,
            worktreeBasePath: worktreeBasePath ?? null,
            activeTaskIds: tasks.map((t) => String(t.task_id ?? "")),
            sanitize: (id) => this.gitWorkspace.sanitizeTaskIdForPath(id),
          })
        : null;

    // Execution memory: failure hotspots + model recommendations + cost anomalies
    let failure_hotspots: Array<{ dedupe_prefix: string; total: number; failed: number }> = [];
    let model_recommendations: Array<{ task_type: string; best_model: string; success_rate: number; total: number }> = [];
    let cost_anomalies: Array<Record<string, unknown>> = [];
    if (this.executionMemoryRepo) {
      try {
        failure_hotspots = await this.executionMemoryRepo.failureHotspots(Math.max(topN, 1));
        const rates = await this.executionMemoryRepo.modelSuccessRates();
        // Per task_type, pick the model with the highest success rate (min 2 samples)
        const byType = new Map<string, Array<{ model: string; total: number; success: number }>>();
        for (const r of rates) {
          const arr = byType.get(r.task_type) ?? [];
          arr.push(r);
          byType.set(r.task_type, arr);
        }
        for (const [task_type, entries] of byType) {
          const best = entries
            .filter((e) => e.total >= 2)
            .sort((a, b) => b.success / b.total - a.success / a.total)[0];
          if (best) {
            model_recommendations.push({
              task_type,
              best_model: best.model,
              success_rate: best.success / best.total,
              total: best.total,
            });
          }
        }
      } catch {
        // execution_memory table may not exist yet (first run); degrade gracefully
      }

      // Cost anomaly detection (token columns may not exist yet)
      try {
        const anomalies = await this.executionMemoryRepo.costAnomalies(2.0);
        cost_anomalies = anomalies.map((a) => ({
          task_id: a.task_id,
          task_type: a.task_type,
          model: a.model,
          input_tokens: a.input_tokens,
          output_tokens: a.output_tokens,
          cost_cents: a.cost_cents,
          avg_input_tokens: a.avg_input_tokens,
          avg_output_tokens: a.avg_output_tokens,
        }));
      } catch {
        // Token columns or table may not exist yet; degrade gracefully
      }
    }

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
      failure_hotspots,
      model_recommendations,
      cost_anomalies,
      ...(resourceLeak ? { resource_leak: resourceLeak } : {}),
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

  /** 成本与 token 聚合视图（agent-farm insights --cost）。 */
  async buildCostReport(): Promise<JsonMap> {
    if (!this.executionMemoryRepo) {
      return { ok: true, cost: null, note: "execution_memory not available" };
    }
    try {
      const summary = await this.executionMemoryRepo.costSummary();
      return {
        ok: true,
        cost: {
          by_task_type: summary.by_task_type,
          by_model: summary.by_model,
          by_wave: summary.by_wave,
          total: summary.total,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async listRecentEvents(limit: number): Promise<EventRecord[]> {
    const events = await this.eventRepo.list();
    const n = Math.max(1, Math.floor(limit));
    return events.slice(-n);
  }
}
