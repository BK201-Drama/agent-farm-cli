import type { TaskStatus } from "./task.js";

/** 与 QueueService.updateStatus 一致的状态迁移表 */
const ALLOWED_TRANSITIONS: Record<TaskStatus, Set<TaskStatus>> = {
  queued: new Set(["claimed", "cancelled", "blocked"]),
  retry: new Set(["claimed", "cancelled", "blocked"]),
  claimed: new Set(["running", "failed", "blocked"]),
  running: new Set(["review", "retry", "failed", "blocked"]),
  review: new Set(["approved", "rejected", "done", "failed", "blocked"]),
  approved: new Set(["done"]),
  rejected: new Set(["retry", "blocked"]),
  done: new Set(),
  failed: new Set(["retry", "blocked", "cancelled"]),
  cancelled: new Set(),
  blocked: new Set(),
};

export function isAllowedTaskTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
}
