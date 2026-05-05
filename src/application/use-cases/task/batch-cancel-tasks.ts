import type { JsonMap } from "../../../domain/task.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";
import { UpdateTaskStatusUseCase } from "./update-task-status.js";

/** 将指定状态下的任务批量迁移为 cancelled（非法迁移则跳过）。 */
export class BatchCancelTasksUseCase {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly updateTaskStatusUseCase: UpdateTaskStatusUseCase
  ) {}

  async execute(fromStatuses: Set<string>, reason: string): Promise<JsonMap> {
    const list = await this.taskRepo.list();
    const cancelled: string[] = [];
    const skipped: { task_id: string; reason: string }[] = [];
    for (const t of list) {
      const id = String(t.task_id ?? "");
      const st = String(t.status ?? "");
      if (!id || !fromStatuses.has(st)) continue;
      try {
        await this.updateTaskStatusUseCase.execute(id, "cancelled", {
          last_error: reason,
        });
        cancelled.push(id);
      } catch (e) {
        skipped.push({
          task_id: id,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return {
      ok: true,
      cancelled_count: cancelled.length,
      cancelled,
      skipped,
    };
  }
}
