import { isAllowedTaskTransition } from "../../../domain/task/transitions.js";
import type { JsonMap, TaskRecord, TaskStatus } from "../../../domain/task.js";
import type { IsoClock } from "../../../domain/ports/clock.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";

export class UpdateTaskStatusUseCase {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly clock: IsoClock
  ) {}

  private applyTransition(task: TaskRecord, status: TaskStatus, extra: JsonMap): TaskRecord {
    const previous = String(task.status ?? "queued") as TaskStatus;
    if (!isAllowedTaskTransition(previous, status)) {
      throw new Error(`illegal transition: ${previous} -> ${status}`);
    }
    const next: TaskRecord = { ...task, status };
    if (status === "running") {
      next.started_at = task.started_at || this.clock();
      next.heartbeat_at = this.clock();
    }
    if (status === "review") {
      next.review_requested_at = this.clock();
    }
    if (["done", "failed", "cancelled", "blocked"].includes(status)) {
      next.completed_at = this.clock();
    }
    Object.assign(next, extra);
    return next;
  }

  async execute(taskId: string, status: TaskStatus, extra: JsonMap = {}): Promise<boolean> {
    if (this.taskRepo.mergeOneTask) {
      return this.taskRepo.mergeOneTask(taskId, (task) => this.applyTransition(task, status, extra));
    }
    const rows = await this.taskRepo.list();
    const task = rows.find((x) => String(x.task_id) === taskId);
    if (!task) return false;
    const next = this.applyTransition(task, status, extra);
    const idx = rows.findIndex((x) => String(x.task_id) === taskId);
    rows[idx] = next;
    await this.taskRepo.save(rows);
    return true;
  }
}
