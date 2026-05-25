import { createDefaultStorageContainer } from "../../bootstrap/default-storage-container.js";
import { DEFAULT_EVENT_FILE, DEFAULT_QUARANTINE_FILE, DEFAULT_TASK_FILE } from "./defaults.js";

export type CliQueueContainerPaths = {
  taskFile: string;
  eventFile: string;
  quarantineFile: string;
};

/**
 * CLI 命令共享的队列存储装配：cwd + 默认 jsonl/sqlite 路径，可被单项覆盖。
 */
export async function createCliQueueContainer(overrides?: Partial<CliQueueContainerPaths>) {
  return createDefaultStorageContainer({
    taskFile: overrides?.taskFile ?? DEFAULT_TASK_FILE,
    eventFile: overrides?.eventFile ?? DEFAULT_EVENT_FILE,
    quarantineFile: overrides?.quarantineFile ?? DEFAULT_QUARANTINE_FILE,
  });
}
