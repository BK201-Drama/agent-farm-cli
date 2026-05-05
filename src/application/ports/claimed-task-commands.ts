import type { JsonMap, TaskStatus } from "../../domain/task.js";

/** Worker 执行单条 claimed 任务时所需的队列命令子集（避免依赖整个 QueueService 门面） */
export interface ClaimedTaskCommands {
  touchHeartbeat(taskId: string): Promise<boolean>;
  hasActiveDuplicateDedupeForTask(task: JsonMap): Promise<boolean>;
  updateStatus(taskId: string, status: TaskStatus, extra?: JsonMap): Promise<boolean>;
}
