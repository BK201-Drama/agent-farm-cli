import type { TaskRecord, TaskStatus } from "../../../domain/task.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";

export type ListTasksOptions = {
  statuses?: TaskStatus[];
  limit?: number;
};

export class ListTasksUseCase {
  constructor(private readonly taskRepo: TaskRepository) {}

  async execute(options: ListTasksOptions = {}): Promise<TaskRecord[]> {
    let tasks = await this.taskRepo.list();
    if (options.statuses && options.statuses.length > 0) {
      const statusSet = new Set(options.statuses);
      tasks = tasks.filter((t) => t.status && statusSet.has(t.status));
    }
    if (options.limit !== undefined && options.limit > 0) {
      tasks = tasks.slice(0, options.limit);
    }
    return tasks;
  }
}
