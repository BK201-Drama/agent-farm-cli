import type { TaskRecord } from "../../../domain/task.js";
import { claimTasksFromRows } from "../../../domain/task/queue.js";
import type { IsoClock } from "../../../domain/ports/clock.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";

export class ClaimTasksUseCase {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly clock: IsoClock
  ) {}

  async execute(limit: number): Promise<TaskRecord[]> {
    const rows = await this.taskRepo.list();
    const { rows: next, claimed } = claimTasksFromRows(rows, limit, this.clock());
    await this.taskRepo.save(next);
    return claimed;
  }
}
