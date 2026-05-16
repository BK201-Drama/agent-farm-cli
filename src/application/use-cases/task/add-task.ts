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
    const normalized = normalizeQueuedTask(task, this.clock());
    if (this.taskRepo.insertTask) {
      const dedupeKey = String(normalized.dedupe_key ?? "").trim();
      if (dedupeKey) {
        const dup = await this.taskRepo.hasActiveDuplicateDedupeKey(
          dedupeKey,
          String(normalized.task_id ?? ""),
        );
        if (dup) {
          throw new Error(`duplicate dedupe_key in active queue: ${dedupeKey}`);
        }
      }
      await this.taskRepo.insertTask(normalized);
      return normalized;
    }
    const rows = await this.taskRepo.list();
    assertNoDuplicateDedupeKey(rows, String(normalized.dedupe_key ?? ""));
    rows.push(normalized);
    await this.taskRepo.save(rows);
    return normalized;
  }
}
