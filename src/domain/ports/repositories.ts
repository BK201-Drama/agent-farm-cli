import type { EventRecord } from "../event/model.js";
import type { TaskRecord } from "../task/model.js";
import type { ExecutionMemoryRecord } from "../execution-memory/model.js";

/** 返回 null 表示跳过写入（例如心跳仅对 running 生效）。抛出错误时事务回滚（SQLite merge 路径）。 */
export type TaskRowMergeResult = TaskRecord | null;

/**
 * 出站端口：任务持久化（由基础设施实现）。
 * 「全表 list + 整表 save」在多 worker 并行下会互相覆盖；SQLite 实现可提供 {@link TaskRepository.mergeOneTask} 做按行原子更新。
 */
export interface TaskRepository {
  list(): Promise<TaskRecord[]>;
  save(rows: TaskRecord[]): Promise<void>;
  hasActiveDuplicateDedupeKey(dedupeKey: string, excludeTaskId: string): Promise<boolean>;
  mergeOneTask?(taskId: string, mutator: (row: TaskRecord) => TaskRowMergeResult): Promise<boolean>;
  /** 单行插入（SQLite）；无实现时 add-task 回退 list+save */
  insertTask?(task: TaskRecord): Promise<void>;
  /** 事务内 claim，按行 merge 更新（SQLite）；无实现时回退 list+save */
  claimTasks?(limit: number, claimant: string, claimedAtIso: string): Promise<TaskRecord[]>;
  /** 租约/claimed 超时回收为 retry（SQLite 按行 UPDATE） */
  recoverStaleTasks?(leaseTimeoutSeconds: number, nowIso: string): Promise<string[]>;
  /** poison 任务从队列 DELETE 并返回待写入隔离区的行 */
  quarantinePoisonTasks?(maxAttempts: number, blockedAtIso: string): Promise<TaskRecord[]>;
  /** 批量 cancelled（SQLite 事务内按行 merge） */
  cancelTasksInStatuses?(
    fromStatuses: ReadonlySet<string>,
    reason: string,
    mutator: (task: TaskRecord) => TaskRowMergeResult,
  ): Promise<{ cancelled: string[]; skipped: Array<{ task_id: string; reason: string }> }>;
  getById(taskId: string): Promise<TaskRecord | null>;
  runInTransaction<T>(fn: () => Promise<T>): Promise<T>;
}

export interface QuarantineRepository {
  list(): Promise<TaskRecord[]>;
  append(rows: TaskRecord[]): Promise<void>;
}

export interface EventRepository {
  list(): Promise<EventRecord[]>;
  append(event: EventRecord): Promise<void>;
}

/** 聚合成本摘要。 */
export type CostSummary = {
  by_task_type: Array<{ task_type: string; cost_cents: number; input_tokens: number; output_tokens: number; count: number }>;
  by_model: Array<{ model: string; cost_cents: number; input_tokens: number; output_tokens: number; count: number }>;
  by_wave: Array<{ wave_prefix: string; cost_cents: number; input_tokens: number; output_tokens: number; count: number }>;
  total: { cost_cents: number; input_tokens: number; output_tokens: number; count: number };
};

/** 执行记忆：跨任务持久化执行结果、diff 摘要和模式识别。 */
export interface ExecutionMemoryRepository {
  /** 写入一条终态记录。 */
  insert(record: ExecutionMemoryRecord): Promise<void>;
  /** 按 dedupe_key 前缀查询已完成任务的 diff 摘要（同 wave 内上下文注入）。 */
  listByDedupePrefix(prefix: string, limit?: number): Promise<ExecutionMemoryRecord[]>;
  /** 统计给定 dedupe_key 前缀的连续失败次数（按 created_at DESC 向前扫描直到非失败）。 */
  countConsecutiveFailures(dedupePrefix: string): Promise<number>;
  /** 按任务类型统计各模型成功率（用于模型推荐）。 */
  modelSuccessRates(): Promise<Array<{ task_type: string; model: string; total: number; success: number }>>;
  /** 按 dedupe_key 前缀统计失败热点（top N）。 */
  failureHotspots(topN: number): Promise<Array<{ dedupe_prefix: string; total: number; failed: number }>>;
  /** 成本聚合：按 task_type / model / wave 维度汇总 token 和成本。 */
  costSummary(): Promise<CostSummary>;
  /** 成本异常检测：返回 token 消耗超过同类平均值 N 倍的任务（thresholdMultiplier ≥ 2.0）。 */
  costAnomalies(thresholdMultiplier: number): Promise<Array<{ task_id: string; task_type: string; model: string; input_tokens: number; output_tokens: number; cost_cents: number; avg_input_tokens: number; avg_output_tokens: number }>>;
}
