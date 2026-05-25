import { resolveQueueWorkspace } from "../domain/task/queue-workspace-paths.js";
import { createContainer } from "./container.js";

const LEASE_TIMEOUT_SECONDS = 1800;
const POISON_MAX_ATTEMPTS = 3;

function shouldSkipAutoRecovery(): boolean {
  return process.env.AGENT_FARM_SKIP_AUTO_RECOVERY === "1";
}

/**
 * 按当前 cwd 解析 `AGENT_FARM_STORAGE` 与 `.agent-farm/queue` 路径后装配容器。
 * 放在 bootstrap，避免 `interfaces/cli` 直接耦合 `createContainer` + 领域路径解析。
 *
 * 容器创建后自动执行队列维护（recoverStale + quarantinePoison），
 * 确保每次 CLI 交互前过期租约被回收、毒化任务被隔离。
 * 跳过：`AGENT_FARM_SKIP_AUTO_RECOVERY=1`。
 */
export async function createDefaultStorageContainer(paths: {
  taskFile: string;
  eventFile: string;
  quarantineFile: string;
}) {
  const w = resolveQueueWorkspace(process.cwd());
  const container = createContainer({
    storage: w.storage,
    dbFile: w.dbFile,
    taskFile: paths.taskFile,
    eventFile: paths.eventFile,
    quarantineFile: paths.quarantineFile,
  });

  if (!shouldSkipAutoRecovery()) {
    await container.queueService.recoverStale(LEASE_TIMEOUT_SECONDS);
    await container.queueService.quarantinePoison(POISON_MAX_ATTEMPTS);
  }

  return container;
}
