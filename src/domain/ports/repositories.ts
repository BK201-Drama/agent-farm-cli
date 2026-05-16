import type { EventRecord } from "../event/model.js";
import type { TaskRecord } from "../task/model.js";

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
  claimTasks?(
    limit: number,
    claimant: string,
    claimedAtIso: string,
  ): Promise<TaskRecord[]>;
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
