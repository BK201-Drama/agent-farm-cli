import { hostname } from "node:os";
import type { TaskRecord } from "../../../domain/task.js";
import { claimTasksFromRows } from "../../../domain/task/board.js";
import type { IsoClock } from "../../../domain/ports/clock.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";

export class ClaimTasksUseCase {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly clock: IsoClock
  ) {}

  async execute(limit: number): Promise<TaskRecord[]> {
    const rows = await this.taskRepo.list();
    const claimant = `${hostname()}#${process.pid}`;
    const { rows: next, claimed } = claimTasksFromRows(rows, limit, this.clock(), claimant);
    await this.taskRepo.save(next);
    return claimed;
  }
}
