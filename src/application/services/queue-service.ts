import { nowIso } from "../../infrastructure/persistence/jsonl/jsonl-utils.js";
import { ACTIVE_STATUSES, type JsonMap, type TaskRecord, type TaskStatus } from "../../domain/task.js";
import type { QuarantineRepository, TaskRepository } from "../../ports/repositories.js";

const ALLOWED_TRANSITIONS: Record<TaskStatus, Set<TaskStatus>> = {
  queued: new Set(["claimed", "cancelled", "blocked"]),
  retry: new Set(["claimed", "cancelled", "blocked"]),
  claimed: new Set(["running", "failed", "blocked"]),
  running: new Set(["review", "retry", "failed", "blocked"]),
  review: new Set(["approved", "rejected", "done", "failed", "blocked"]),
  approved: new Set(["done"]),
  rejected: new Set(["retry", "blocked"]),
  done: new Set(),
  failed: new Set(["retry", "blocked", "cancelled"]),
  cancelled: new Set(),
  blocked: new Set(),
};

export class QueueService {
  constructor(private readonly taskRepo: TaskRepository, private readonly quarantineRepo: QuarantineRepository) {}

  async addTask(task: JsonMap): Promise<TaskRecord> {
    const rows = await this.taskRepo.list();
    const normalized = this.normalizeTask(task);
    this.assertNoDuplicateDedupe(rows, String(normalized.dedupe_key ?? ""));
    rows.push(normalized);
    await this.taskRepo.save(rows);
    return normalized;
  }

  async listTasks(): Promise<TaskRecord[]> {
    return await this.taskRepo.list();
  }

  async claimTasks(limit: number): Promise<TaskRecord[]> {
    const rows = await this.taskRepo.list();
    const claimed: TaskRecord[] = [];
    for (const row of rows) {
      if (claimed.length >= limit) break;
      if (!["queued", "retry"].includes(String(row.status))) continue;
      row.status = "claimed";
      row.claimed_at = nowIso();
      claimed.push({ ...row });
    }
    await this.taskRepo.save(rows);
    return claimed;
  }

  async updateStatus(taskId: string, status: TaskStatus, extra: JsonMap = {}): Promise<boolean> {
    const rows = await this.taskRepo.list();
    const task = rows.find((x) => String(x.task_id) === taskId);
    if (!task) return false;
    const previous = String(task.status ?? "queued") as TaskStatus;
    if (previous !== status && !ALLOWED_TRANSITIONS[previous]?.has(status)) {
      throw new Error(`illegal transition: ${previous} -> ${status}`);
    }
    task.status = status;
    if (status === "running") {
      task.started_at = task.started_at || nowIso();
      task.heartbeat_at = nowIso();
    }
    if (status === "review") {
      task.review_requested_at = nowIso();
    }
    if (["done", "failed", "cancelled", "blocked"].includes(status)) {
      task.completed_at = nowIso();
    }
    Object.assign(task, extra);
    await this.taskRepo.save(rows);
    return true;
  }

  async touchHeartbeat(taskId: string): Promise<boolean> {
    const rows = await this.taskRepo.list();
    const task = rows.find((x) => String(x.task_id) === taskId);
    if (!task) return false;
    if (String(task.status) !== "running") return false;
    task.heartbeat_at = nowIso();
    await this.taskRepo.save(rows);
    return true;
  }

  async reviewApprove(taskId: string, reviewer: string, notes: string, spawnExecute: boolean): Promise<JsonMap> {
    const rows = await this.taskRepo.list();
    const task = rows.find((x) => String(x.task_id) === taskId);
    if (!task) throw new Error(`task not found: ${taskId}`);
    if (String(task.status) !== "review") throw new Error("task status must be review");
    task.status = "approved";
    task.approved_at = nowIso();
    task.status = "done";
    task.reviewed_by = reviewer;
    task.review_notes = notes;
    task.completed_at = nowIso();

    let spawnedTaskId: string | null = null;
    if (spawnExecute && String(task.mode) === "plan") {
      spawnedTaskId = `${taskId}::exec::${Date.now()}`;
      rows.push(
        this.normalizeTask({
          task_id: spawnedTaskId,
          topic: task.topic,
          status: "queued",
          mode: "execute",
          parent_task_id: taskId,
          prompt:
            (task.execute_prompt as string | undefined) ??
            `Execute approved plan task ${taskId} with tests and validation.`,
        })
      );
    }
    await this.taskRepo.save(rows);
    return { ok: true, task_id: taskId, status: "done", spawned_execute_task_id: spawnedTaskId };
  }

  async reviewReject(taskId: string, reviewer: string, reason: string, moveToRetry: boolean): Promise<JsonMap> {
    const rows = await this.taskRepo.list();
    const task = rows.find((x) => String(x.task_id) === taskId);
    if (!task) throw new Error(`task not found: ${taskId}`);
    if (String(task.status) !== "review") throw new Error("task status must be review");
    task.reviewed_by = reviewer;
    task.reject_reason = reason;
    if (moveToRetry) {
      task.status = "retry";
      task.attempt = Number(task.attempt ?? 0) + 1;
      task.last_error = `review rejected: ${reason || "(no reason)"}`;
      task.prompt = `${String(task.prompt ?? "")}\n\n[review-fix]\n${reason}`;
    } else {
      task.status = "rejected";
    }
    await this.taskRepo.save(rows);
    return { ok: true, task_id: taskId, status: task.status };
  }

  async recoverStale(leaseTimeoutSeconds: number): Promise<JsonMap> {
    const rows = await this.taskRepo.list();
    const now = Date.now();
    const recovered: string[] = [];
    for (const row of rows) {
      if (String(row.status) !== "running") continue;
      const t = Date.parse(String(row.heartbeat_at ?? row.started_at ?? ""));
      if (Number.isNaN(t)) continue;
      const age = (now - t) / 1000;
      if (age < leaseTimeoutSeconds) continue;
      row.status = "retry";
      row.attempt = Number(row.attempt ?? 0) + 1;
      row.last_error = `lease timeout recovered after ${Math.floor(age)}s`;
      row.recovered_at = nowIso();
      recovered.push(String(row.task_id));
    }
    await this.taskRepo.save(rows);
    return { ok: true, recovered_count: recovered.length, task_ids: recovered };
  }

  async quarantinePoison(maxAttempts: number): Promise<JsonMap> {
    const rows = await this.taskRepo.list();
    const keep: TaskRecord[] = [];
    const blocked: TaskRecord[] = [];
    for (const row of rows) {
      const attempt = Number(row.attempt ?? 0);
      const status = String(row.status);
      if (["retry", "failed"].includes(status) && attempt >= maxAttempts) {
        blocked.push({
          ...row,
          status: "blocked",
          blocked_at: nowIso(),
          blocked_reason: `poison threshold reached: attempt=${attempt} >= ${maxAttempts}`,
        });
      } else {
        keep.push(row);
      }
    }
    if (blocked.length > 0) {
      await this.quarantineRepo.append(blocked);
      await this.taskRepo.save(keep);
    }
    return { ok: true, quarantined_count: blocked.length, task_ids: blocked.map((x) => x.task_id) };
  }

  private normalizeTask(input: JsonMap): TaskRecord {
    return {
      status: "queued",
      topic: "general",
      mode: "execute",
      created_at: nowIso(),
      started_at: null,
      ...input,
    };
  }

  private assertNoDuplicateDedupe(rows: TaskRecord[], dedupeKey: string): void {
    const normalized = dedupeKey.trim();
    if (!normalized) return;
    const dup = rows.some(
      (row) => ACTIVE_STATUSES.has((row.status ?? "queued") as TaskStatus) && String(row.dedupe_key ?? "").trim() === normalized
    );
    if (dup) throw new Error(`duplicate dedupe_key in active queue: ${normalized}`);
  }
}
