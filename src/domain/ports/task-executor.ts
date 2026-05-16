/** ADR-001：可插拔执行器契约（M2 首实现 Shell / Cursor SDK 适配器）。 */

export type TaskExecutorRunInput = {
  task_id: string;
  prompt: string;
  workspace_dir: string;
  attempt: number;
  /** wave / 任务级先读路径（executor 可注入 prompt 或 SDK 选项） */
  read_paths?: string[];
};

export type TaskExecutorRunResult = {
  exit_code: number;
  output: string;
  /** 执行器特有元数据（如 OpenCode NDJSON stream 观察器） */
  meta?: Record<string, unknown>;
};

export type TaskExecutorPort = {
  readonly id: string;
  run(input: TaskExecutorRunInput): Promise<TaskExecutorRunResult>;
};
