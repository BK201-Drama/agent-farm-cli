import type { JsonMap } from "../../../domain/task.js";
import { partitionPoisonQuarantine } from "../../../domain/task/queue.js";
import type { IsoClock } from "../../../domain/ports/clock.js";
import type { QuarantineRepository, TaskRepository } from "../../../domain/ports/repositories.js";

export class QuarantinePoisonUseCase {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly quarantineRepo: QuarantineRepository,
    private readonly clock: IsoClock
  ) {}

  async execute(maxAttempts: number): Promise<JsonMap> {
    const rows = await this.taskRepo.list();
    const { keep, blocked } = partitionPoisonQuarantine(rows, maxAttempts, this.clock());
    if (blocked.length > 0) {
      await this.quarantineRepo.append(blocked);
      await this.taskRepo.save(keep);
    }
    return { ok: true, quarantined_count: blocked.length, task_ids: blocked.map((x) => x.task_id) };
  }
}
