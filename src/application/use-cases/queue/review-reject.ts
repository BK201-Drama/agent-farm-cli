import type { JsonMap } from "../../../domain/task.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";

export class ReviewRejectUseCase {
  constructor(private readonly taskRepo: TaskRepository) {}

  async execute(
    taskId: string,
    reviewer: string,
    reason: string,
    moveToRetry: boolean
  ): Promise<JsonMap> {
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
}
