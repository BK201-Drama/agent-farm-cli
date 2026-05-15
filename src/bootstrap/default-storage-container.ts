import { resolveQueueWorkspace } from "../domain/task/queue-workspace-paths.js";
import { createContainer } from "./container.js";

/**
 * 按当前 cwd 解析 `AGENT_FARM_STORAGE` 与 `.agent-farm/queue` 路径后装配容器。
 * 放在 bootstrap，避免 `interfaces/cli` 直接耦合 `createContainer` + 领域路径解析。
 */
export function createDefaultStorageContainer(paths: {
  taskFile: string;
  eventFile: string;
  quarantineFile: string;
}) {
  const w = resolveQueueWorkspace(process.cwd());
  return createContainer({
    storage: w.storage,
    dbFile: w.dbFile,
    taskFile: paths.taskFile,
    eventFile: paths.eventFile,
    quarantineFile: paths.quarantineFile,
  });
}
