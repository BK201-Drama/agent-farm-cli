import type { JsonMap, TaskStatus } from "../../domain/task.js";

export interface DashboardQueueCommands {
  reviewApprove(taskId: string, reviewer: string, notes: string, spawnExecute: boolean): Promise<JsonMap>;
  reviewReject(taskId: string, reviewer: string, reason: string, moveToRetry: boolean): Promise<JsonMap>;
  updateStatus(taskId: string, status: TaskStatus, extra?: JsonMap): Promise<boolean>;
}