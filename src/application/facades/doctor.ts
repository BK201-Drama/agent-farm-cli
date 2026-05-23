import type { JsonMap, TaskStatus } from "../../domain/task.js";
import { ACTIVE_STATUSES, TASK_STATUSES } from "../../domain/task.js";
import type { EventRepository, QuarantineRepository, TaskRepository } from "../../domain/ports/repositories.js";
import type { GitWorkspacePort } from "../contracts/git-workspace.js";

export class DoctorService {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly quarantineRepo: QuarantineRepository,
    private readonly gitWorkspace: GitWorkspacePort,
    private readonly eventRepo?: EventRepository,
  ) {}

  async build(
    leaseTimeoutSeconds: number,
    reviewOverdueHours: number,
    topN: number,
    worktreeBasePath?: string,
  ): Promise<JsonMap> {
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

    const tasksWithOpencodeHealPrompt = tasks.filter((t) => String(t.prompt ?? "").includes("[opencode-heal]")).length;

    const heartbeatMissing = tasks
      .filter((x) => x.heartbeat_at != null && x.claimed_by == null)
      .map((x) => ({ task_id: x.task_id, heartbeat_at: x.heartbeat_at }));

    const orphanWorktrees =
      worktreeBasePath != null
        ? this.gitWorkspace.findOrphanWorktrees(
            worktreeBasePath,
            tasks.map((t) => String(t.task_id ?? "")),
          )
        : [];

    let opencode_stream_diag_recent_count = 0;
    const opencode_stream_diag_by_stage: Record<string, number> = {};
    let empty_run_recent: Array<{ task_id: string; reason?: string }> = [];
    if (this.eventRepo) {
      const events = await this.eventRepo.list();
      const diags = events.filter((e) => String(e.event ?? "") === "task_opencode_stream_diag").slice(-400);
      opencode_stream_diag_recent_count = diags.length;
      for (const e of diags) {
        const st = String(e.stage ?? "unknown");
        opencode_stream_diag_by_stage[st] = (opencode_stream_diag_by_stage[st] ?? 0) + 1;
      }
      const seen = new Set<string>();
      empty_run_recent = [];
      for (let i = events.length - 1; i >= 0 && empty_run_recent.length < 20; i--) {
        const e = events[i]!;
        if (String(e.event ?? "") !== "task_empty_run_abort") continue;
        const id = String(e.task_id ?? "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        empty_run_recent.push({ task_id: id, reason: String(e.reason ?? "") });
      }
    }

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
      tasks_with_opencode_heal_prompt: tasksWithOpencodeHealPrompt,
      heartbeat_missing_count: heartbeatMissing.length,
      heartbeat_missing: heartbeatMissing,
      orphan_worktrees_count: orphanWorktrees.length,
      orphan_worktrees: orphanWorktrees,
      opencode_stream_diag_recent_count,
      opencode_stream_diag_by_stage,
      empty_run_recent_count: empty_run_recent.length,
      empty_run_recent,
    };
  }
}
