export const TASK_STATUSES = [
  "queued",
  "retry",
  "claimed",
  "running",
  "review",
  "approved",
  "rejected",
  "done",
  "failed",
  "cancelled",
  "blocked",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskMode = "plan" | "execute";

export type JsonMap = Record<string, unknown>;

export type TaskRecord = JsonMap & {
  task_id?: string;
  status?: TaskStatus;
  mode?: TaskMode;
  prompt?: string;
  topic?: string;
  dedupe_key?: string;
};

export const ACTIVE_STATUSES = new Set<TaskStatus>([
  "queued",
  "retry",
  "claimed",
  "running",
  "review",
  "approved",
]);

export function asTaskStatus(value: unknown, fallback: TaskStatus = "queued"): TaskStatus {
  const text = String(value ?? "");
  return (TASK_STATUSES as readonly string[]).includes(text) ? (text as TaskStatus) : fallback;
}
