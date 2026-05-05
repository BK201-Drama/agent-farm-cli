import type { EventRecord } from "../domain/event.js";
import type { TaskRecord } from "../domain/task.js";

export interface TaskRepository {
  list(): Promise<TaskRecord[]>;
  save(rows: TaskRecord[]): Promise<void>;
  /** 是否存在另一条「活跃」任务与给定 dedupe_key 冲突（排除 excludeTaskId） */
  hasActiveDuplicateDedupeKey(dedupeKey: string, excludeTaskId: string): Promise<boolean>;
}

export interface QuarantineRepository {
  list(): Promise<TaskRecord[]>;
  append(rows: TaskRecord[]): Promise<void>;
}

export interface EventRepository {
  list(): Promise<EventRecord[]>;
  append(event: EventRecord): Promise<void>;
}
