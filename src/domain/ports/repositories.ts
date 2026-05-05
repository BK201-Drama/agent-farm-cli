import type { EventRecord } from "../event/model.js";
import type { TaskRecord } from "../task/model.js";

/**
 * 出站端口：任务持久化（由基础设施实现）。
 * 当前实现多为「全表 list + 整表 save」，多进程并发下存在覆盖风险；扩展时可改为按 task_id 版本化更新。
 */
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
