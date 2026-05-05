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
  /** 覆盖 worker 的 `--ai-review-command-template`；用于单任务不同验收命令 */
  ai_review_command_template?: string;
  /** 为 true 时跳过 AI 验收（即使 worker 开启了 --require-ai-review 也会跳过，仅用于少数例外任务） */
  skip_ai_review?: boolean;
  /** 可选；展开为 `{acceptance_criteria}` 供验收脚本使用 */
  acceptance_criteria?: string;
  /** 数值越大越优先被 claim（仅 queued/retry 参与排序，默认 0） */
  priority?: number;
  /** claim 时写入，便于多机排查（hostname#pid） */
  claimed_by?: string;
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
