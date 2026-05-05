import type { JsonMap, TaskRecord } from "../../../domain/task.js";
import { assertNoDuplicateDedupeKey, normalizeQueuedTask } from "../../../domain/task/enqueue.js";
import type { IsoClock } from "../../../domain/ports/clock.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";

export class AddTaskUseCase {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly clock: IsoClock
  ) {}

  async execute(task: JsonMap): Promise<TaskRecord> {
    const rows = await this.taskRepo.list();
    const normalized = normalizeQueuedTask(task, this.clock());
    assertNoDuplicateDedupeKey(rows, String(normalized.dedupe_key ?? ""));
    rows.push(normalized);
    await this.taskRepo.save(rows);
    return normalized;
  }
}
