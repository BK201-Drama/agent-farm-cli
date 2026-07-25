import type { TaskStatus } from "./model.js";

/** 任务状态合法迁移（须与 `update-task-status` 用例及队列更新语义保持一致） */
const ALLOWED_TRANSITIONS: Record<TaskStatus, Set<TaskStatus>> = {
  queued: new Set(["claimed", "cancelled", "blocked"]),
  retry: new Set(["claimed", "cancelled", "blocked"]),
  /** worker 在标记 running 前崩溃时回滚为 retry，避免长期卡在 claimed */
  claimed: new Set(["running", "retry", "failed", "blocked", "cancelled"]),
  /** running → awaiting_decision: MCP bridge 检测到决策升级，worker 释放 */
  running: new Set(["review", "retry", "failed", "blocked", "cancelled", "awaiting_decision"]),
  review: new Set(["approved", "rejected", "done", "failed", "blocked", "cancelled"]),
  approved: new Set(["done", "cancelled"]),
  /** awaiting_decision: 决策等待人工裁决。解决后 → retry 重试；超时/拒绝 → failed；重新排队 → queued */
  awaiting_decision: new Set(["retry", "failed", "queued", "blocked"]),
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
