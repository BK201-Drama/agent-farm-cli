import type { EventRecord } from "../event/model.js";
import type { TaskRecord } from "../task/model.js";

/** 出站端口：任务持久化（由基础设施实现） */
export interface TaskRepository {
  list(): Promise<TaskRecord[]>;
  save(rows: TaskRecord[]): Promise<void>;
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
