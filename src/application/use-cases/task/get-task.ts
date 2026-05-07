import type { TaskRecord } from "../../../domain/task.js";
import type { TaskRepository } from "../../../domain/ports/repositories.js";

export class GetTaskUseCase {
  constructor(private readonly taskRepo: TaskRepository) {}

  async execute(taskId: string): Promise<TaskRecord | null> {
    return await this.taskRepo.getById(taskId);
  }
}