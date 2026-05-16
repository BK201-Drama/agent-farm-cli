import type { JsonMap, TaskRecord } from "../../../domain/task.js";
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
    const key = String(taskId);
    const task =
      (this.taskRepo.getById ? await this.taskRepo.getById(key) : null) ??
      (await this.taskRepo.list()).find((x) => String(x.task_id) === key);
    if (!task) throw new Error(`task not found: ${taskId}`);
    if (String(task.status) !== "review") throw new Error("task status must be review");

    const doneTask: TaskRecord = {
      ...task,
      status: "done",
      approved_at: this.clock(),
      reviewed_by: reviewer,
      review_notes: notes,
      completed_at: this.clock(),
    };

    let spawnedTaskId: string | null = null;
    let spawned: TaskRecord | null = null;
    if (spawnExecute && String(task.mode) === "plan") {
      spawnedTaskId = `${taskId}::exec::${Date.now()}`;
      spawned = normalizeQueuedTask(
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
        this.clock(),
      );
    }

    if (this.taskRepo.mergeOneTask) {
      const ok = await this.taskRepo.mergeOneTask(key, () => doneTask);
      if (!ok) throw new Error(`task not found: ${taskId}`);
      if (spawned) {
        if (this.taskRepo.insertTask) {
          await this.taskRepo.insertTask(spawned);
        } else {
          const rows = await this.taskRepo.list();
          rows.push(spawned);
          await this.taskRepo.save(rows);
        }
      }
      return { ok: true, task_id: taskId, status: "done", spawned_execute_task_id: spawnedTaskId };
    }

    const rows = await this.taskRepo.list();
    const idx = rows.findIndex((x) => String(x.task_id) === key);
    if (idx < 0) throw new Error(`task not found: ${taskId}`);
    rows[idx] = doneTask;
    if (spawned) rows.push(spawned);
    await this.taskRepo.save(rows);
    return { ok: true, task_id: taskId, status: "done", spawned_execute_task_id: spawnedTaskId };
  }
}
