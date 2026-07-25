import type { JsonMap } from "../task/model.js";

/** Diff 摘要：文件清单 + 行数。 */
export interface DiffSummary {
  files: string[];
  lines_added: number;
  lines_removed: number;
}

/** 任务终态时写入执行记忆的一条记录。 */
export interface ExecutionMemoryRecord {
  task_id: string;
  dedupe_key: string;
  /** 任务 prompt（截断存储） */
  prompt: string;
  /** 执行所用模型 */
  model: string;
  /** 终态 exit_code */
  exit_code: number;
  /** diff 摘要（文件清单 + 行数），终态时采集 */
  diff_summary: DiffSummary | null;
  /** 执行耗时（毫秒） */
  duration_ms: number;
  /** 任务类型：code_gen / doc_gen / test_gen / ... */
  task_type: string;
  /** 终态：done / failed / blocked */
  terminal_status: string;
  /** 写入时间 ISO */
  created_at: string;
}

export type ExecutionMemoryJson = JsonMap & ExecutionMemoryRecord;
