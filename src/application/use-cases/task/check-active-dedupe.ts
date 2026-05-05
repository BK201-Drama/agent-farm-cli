import type { JsonMap } from "../../../domain/task.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";

export class CheckActiveDedupeUseCase {
  constructor(private readonly taskRepo: TaskRepository) {}

  async execute(task: JsonMap): Promise<boolean> {
    const key = String(task.dedupe_key ?? "").trim();
    const taskId = String(task.task_id ?? "");
    if (!key) return false;
    return this.taskRepo.hasActiveDuplicateDedupeKey(key, taskId);
  }
}
