import { createDefaultStorageContainer } from "../../compose.js";
import { DEFAULT_EVENT_FILE, DEFAULT_QUARANTINE_FILE } from "../../defaults.js";

export function queueCliContainer(opts: { taskFile: string; quarantineFile?: string }) {
  return createDefaultStorageContainer({
    taskFile: opts.taskFile,
    eventFile: DEFAULT_EVENT_FILE,
    quarantineFile: opts.quarantineFile ?? DEFAULT_QUARANTINE_FILE,
  });
}
