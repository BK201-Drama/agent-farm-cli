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
  /** 累计输入 token 数（来自 NDJSON stream observer） */
  input_tokens?: number;
  /** 累计输出 token 数（来自 NDJSON stream observer） */
  output_tokens?: number;
  /** 预估成本（USD 分，写入时由模型定价计算） */
  cost_cents?: number;
}

export type ExecutionMemoryJson = JsonMap & ExecutionMemoryRecord;
