import type { IsoClock } from "../../../domain/ports/clock.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";

export class TouchHeartbeatUseCase {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly clock: IsoClock
  ) {}

  async execute(taskId: string): Promise<boolean> {
    const rows = await this.taskRepo.list();
    const task = rows.find((x) => String(x.task_id) === taskId);
    if (!task) return false;
    if (String(task.status) !== "running") return false;
    task.heartbeat_at = this.clock();
    await this.taskRepo.save(rows);
    return true;
  }
}
