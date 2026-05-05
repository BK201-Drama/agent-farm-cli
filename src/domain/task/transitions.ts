import type { TaskStatus } from "./model.js";

/** 任务状态合法迁移（须与 `update-task-status` 用例及队列更新语义保持一致） */
const ALLOWED_TRANSITIONS: Record<TaskStatus, Set<TaskStatus>> = {
  queued: new Set(["claimed", "cancelled", "blocked"]),
  retry: new Set(["claimed", "cancelled", "blocked"]),
  claimed: new Set(["running", "failed", "blocked", "cancelled"]),
  running: new Set(["review", "retry", "failed", "blocked", "cancelled"]),
  review: new Set(["approved", "rejected", "done", "failed", "blocked", "cancelled"]),
  approved: new Set(["done", "cancelled"]),
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
