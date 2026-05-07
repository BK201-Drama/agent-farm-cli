import type { TaskStatus } from "../../../../../domain/task.js";

export function getAvailableActions(status: TaskStatus): string[] {
  if (status === "review") return ["a:批准", "r:驳回"];
  if (status === "queued" || status === "retry") return ["c:取消"];
  return [];
}
