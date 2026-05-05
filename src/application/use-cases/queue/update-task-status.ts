import { isAllowedTaskTransition } from "../../../domain/task-status-transitions.js";
import type { JsonMap, TaskStatus } from "../../../domain/task.js";
import type { IsoClock } from "../../../domain/ports/clock.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";

export class UpdateTaskStatusUseCase {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly clock: IsoClock
  ) {}

  async execute(taskId: string, status: TaskStatus, extra: JsonMap = {}): Promise<boolean> {
    const rows = await this.taskRepo.list();
    const task = rows.find((x) => String(x.task_id) === taskId);
    if (!task) return false;
    const previous = String(task.status ?? "queued") as TaskStatus;
    if (!isAllowedTaskTransition(previous, status)) {
      throw new Error(`illegal transition: ${previous} -> ${status}`);
    }
    task.status = status;
    if (status === "running") {
      task.started_at = task.started_at || this.clock();
      task.heartbeat_at = this.clock();
    }
    if (status === "review") {
      task.review_requested_at = this.clock();
    }
    if (["done", "failed", "cancelled", "blocked"].includes(status)) {
      task.completed_at = this.clock();
    }
    Object.assign(task, extra);
    await this.taskRepo.save(rows);
    return true;
  }
}
