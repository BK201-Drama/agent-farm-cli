import type { JsonMap, TaskRecord } from "../../../domain/task.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";

export class ReviewRejectUseCase {
  constructor(private readonly taskRepo: TaskRepository) {}

  async execute(
    taskId: string,
    reviewer: string,
    reason: string,
    moveToRetry: boolean
  ): Promise<JsonMap> {
    const key = String(taskId);
    const task =
      (this.taskRepo.getById ? await this.taskRepo.getById(key) : null) ??
      (await this.taskRepo.list()).find((x) => String(x.task_id) === key);
    if (!task) throw new Error(`task not found: ${taskId}`);
    if (String(task.status) !== "review") throw new Error("task status must be review");

    const apply = (): TaskRecord => {
      const next: TaskRecord = {
        ...task,
        reviewed_by: reviewer,
        reject_reason: reason,
      };
      if (moveToRetry) {
        next.status = "retry";
        next.attempt = Number(task.attempt ?? 0) + 1;
        next.last_error = `review rejected: ${reason || "(no reason)"}`;
        next.prompt = `${String(task.prompt ?? "")}\n\n[review-fix]\n${reason}`;
      } else {
        next.status = "rejected";
      }
      return next;
    };

    if (this.taskRepo.mergeOneTask) {
      const ok = await this.taskRepo.mergeOneTask(key, () => apply());
      if (!ok) throw new Error(`task not found: ${taskId}`);
      const updated = this.taskRepo.getById ? await this.taskRepo.getById(key) : apply();
      return { ok: true, task_id: taskId, status: String(updated?.status ?? "") };
    }

    const rows = await this.taskRepo.list();
    const idx = rows.findIndex((x) => String(x.task_id) === key);
    if (idx < 0) throw new Error(`task not found: ${taskId}`);
    rows[idx] = apply();
    await this.taskRepo.save(rows);
    return { ok: true, task_id: taskId, status: String(rows[idx]!.status) };
  }
}
