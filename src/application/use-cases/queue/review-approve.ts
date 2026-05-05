import type { JsonMap } from "../../../domain/task.js";
import { normalizeQueuedTask } from "../../../domain/task/enqueue.js";
import type { IsoClock } from "../../../domain/ports/clock.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";

export class ReviewApproveUseCase {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly clock: IsoClock
  ) {}

  async execute(
    taskId: string,
    reviewer: string,
    notes: string,
    spawnExecute: boolean
  ): Promise<JsonMap> {
    const rows = await this.taskRepo.list();
    const task = rows.find((x) => String(x.task_id) === taskId);
    if (!task) throw new Error(`task not found: ${taskId}`);
    if (String(task.status) !== "review") throw new Error("task status must be review");
    task.status = "approved";
    task.approved_at = this.clock();
    task.status = "done";
    task.reviewed_by = reviewer;
    task.review_notes = notes;
    task.completed_at = this.clock();

    let spawnedTaskId: string | null = null;
    if (spawnExecute && String(task.mode) === "plan") {
      spawnedTaskId = `${taskId}::exec::${Date.now()}`;
      rows.push(
        normalizeQueuedTask(
          {
            task_id: spawnedTaskId,
            topic: task.topic,
            status: "queued",
            mode: "execute",
            parent_task_id: taskId,
            prompt:
              (task.execute_prompt as string | undefined) ??
              `Execute approved plan task ${taskId} with tests and validation.`,
          },
          this.clock()
        )
      );
    }
    await this.taskRepo.save(rows);
    return { ok: true, task_id: taskId, status: "done", spawned_execute_task_id: spawnedTaskId };
  }
}
