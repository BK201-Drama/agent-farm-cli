import { isAllowedTaskTransition } from "../../../domain/task/transitions.js";
import type { JsonMap, TaskRecord, TaskStatus } from "../../../domain/task.js";
import type { IsoClock } from "../../../domain/ports/clock.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";

const MANUAL_RETRY_FROM: TaskStatus[] = ["running", "claimed", "failed", "rejected"];

export class ManualRetryTaskUseCase {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly clock: IsoClock,
  ) {}

  async execute(taskId: string, reason = "manual stuck retry"): Promise<JsonMap> {
    const key = String(taskId).trim();
    if (!key) {
      return { ok: false, error: "task_id required" };
    }

    const apply = (task: TaskRecord): TaskRecord | null => {
      const from = String(task.status ?? "queued") as TaskStatus;
      if (!MANUAL_RETRY_FROM.includes(from)) {
        throw new Error(`stuck retry: status "${from}" is not retryable (allowed: ${MANUAL_RETRY_FROM.join(", ")})`);
      }
      if (!isAllowedTaskTransition(from, "retry")) {
        throw new Error(`stuck retry: illegal transition ${from} -> retry`);
      }
      const next: TaskRecord = {
        ...task,
        status: "retry",
        attempt: Number(task.attempt ?? 0) + 1,
        last_error: reason,
        recovered_at: this.clock(),
      };
      delete (next as { claimed_at?: string }).claimed_at;
      delete (next as { claimed_by?: string }).claimed_by;
      delete (next as { heartbeat_at?: string }).heartbeat_at;
      delete (next as { completed_at?: string }).completed_at;
      return next;
    };

    if (this.taskRepo.mergeOneTask) {
      try {
        const ok = await this.taskRepo.mergeOneTask(key, (row) => apply(row));
        if (!ok) return { ok: false, error: "task not found", task_id: key };
        return { ok: true, task_id: key, status: "retry" };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), task_id: key };
      }
    }

    const rows = await this.taskRepo.list();
    const idx = rows.findIndex((x) => String(x.task_id) === key);
    if (idx < 0) return { ok: false, error: "task not found", task_id: key };
    try {
      rows[idx] = apply(rows[idx]!)!;
      await this.taskRepo.save(rows);
      return { ok: true, task_id: key, status: "retry" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e), task_id: key };
    }
  }
}
