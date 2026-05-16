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
    const nowIso = this.clock();
    if (this.taskRepo.recoverStaleTasks) {
      const recoveredIds = await this.taskRepo.recoverStaleTasks(leaseTimeoutSeconds, nowIso);
      return { ok: true, recovered_count: recoveredIds.length, task_ids: recoveredIds };
    }
    const rows = await this.taskRepo.list();
    const { rows: next, recoveredIds } = recoverStaleInRows(
      rows,
      leaseTimeoutSeconds,
      Date.now(),
      nowIso,
    );
    await this.taskRepo.save(next);
    return { ok: true, recovered_count: recoveredIds.length, task_ids: recoveredIds };
  }
}
