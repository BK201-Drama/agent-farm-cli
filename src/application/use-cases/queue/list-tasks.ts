import type { TaskRecord } from "../../../domain/task.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";

export class ListTasksUseCase {
  constructor(private readonly taskRepo: TaskRepository) {}

  async execute(): Promise<TaskRecord[]> {
    return await this.taskRepo.list();
  }
}
