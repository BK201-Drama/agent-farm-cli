import { createContainer } from "../../bootstrap/container.js";
import {
  DEFAULT_DB_FILE,
  DEFAULT_EVENT_FILE,
  DEFAULT_QUARANTINE_FILE,
  DEFAULT_STORAGE,
  DEFAULT_TASK_FILE,
} from "./defaults.js";

export function getContainer(opts: {
  storage?: string;
  dbFile?: string;
  taskFile?: string;
  eventFile?: string;
  quarantineFile?: string;
}) {
  const storage = String(opts.storage ?? DEFAULT_STORAGE).toLowerCase();
  if (!["sqlite", "jsonl"].includes(storage)) {
    throw new Error(`invalid storage: ${storage}. expected sqlite|jsonl`);
  }
  return createContainer({
    storage: storage as "jsonl" | "sqlite",
    dbFile: String(opts.dbFile ?? DEFAULT_DB_FILE),
    taskFile: String(opts.taskFile ?? DEFAULT_TASK_FILE),
    eventFile: String(opts.eventFile ?? DEFAULT_EVENT_FILE),
    quarantineFile: String(opts.quarantineFile ?? DEFAULT_QUARANTINE_FILE),
  });
}

/** 使用 AGENT_FARM_STORAGE（默认 sqlite）与给定 jsonl 路径字段创建容器 */
export function createDefaultStorageContainer(paths: {
  taskFile: string;
  eventFile: string;
  quarantineFile: string;
}) {
  return createContainer({
    storage: DEFAULT_STORAGE,
    dbFile: DEFAULT_DB_FILE,
    ...paths,
  });
}
