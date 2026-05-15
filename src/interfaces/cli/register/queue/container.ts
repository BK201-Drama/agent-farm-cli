import { DEFAULT_QUARANTINE_FILE } from "../../defaults.js";
import { createCliQueueContainer } from "../../default-queue-container.js";

export function queueCliContainer(opts: { taskFile: string; quarantineFile?: string }) {
  return createCliQueueContainer({
    taskFile: opts.taskFile,
    quarantineFile: opts.quarantineFile ?? DEFAULT_QUARANTINE_FILE,
  });
}
