import type { JsonMap } from "../../../domain/task.js";
import { recoverStaleInRows } from "../../../domain/task/board.js";
import type { IsoClock } from "../../../domain/ports/clock.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";

export class RecoverStaleUseCase {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly clock: IsoClock
  ) {}

  async execute(leaseTimeoutSeconds: number): Promise<JsonMap> {
    const rows = await this.taskRepo.list();
    const nowMs = Date.now();
    const { rows: next, recoveredIds } = recoverStaleInRows(
      rows,
      leaseTimeoutSeconds,
      nowMs,
      this.clock()
    );
    await this.taskRepo.save(next);
    return { ok: true, recovered_count: recoveredIds.length, task_ids: recoveredIds };
  }
}
