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
}

export interface QuarantineRepository {
  list(): Promise<TaskRecord[]>;
  append(rows: TaskRecord[]): Promise<void>;
}

export interface EventRepository {
  list(): Promise<EventRecord[]>;
  append(event: EventRecord): Promise<void>;
}
