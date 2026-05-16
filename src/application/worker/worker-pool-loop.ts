import type { JsonMap } from "../../domain/task.js";

/** 可注入依赖，供 `runWorkerLoop` 与单测使用。 */
export type WorkerPoolLoopDeps = {
  maxConcurrency: number;
  loopSleepMs: number;
  drainIdleLoops: number;
  claimTasks: (limit: number) => Promise<JsonMap[]>;
  runClaimedTask: (task: JsonMap) => Promise<void>;
  onTick: () => Promise<void>;
};

/**
 * 维持最多 `maxConcurrency` 条 in-flight 任务：任意一条结束后立即补 claim，
 * 而不是等整批 `allSettled` 后再认领下一批。
 */
export async function runWorkerPoolLoop(deps: WorkerPoolLoopDeps): Promise<void> {
  const max = Math.max(1, deps.maxConcurrency);
  let drainEmptyCount = 0;
  let inFlight = 0;
  let completionWaiters: Array<() => void> = [];

  const notifyCompletion = () => {
    const waiters = completionWaiters;
    completionWaiters = [];
    for (const w of waiters) w();
  };

  const waitForCompletion = (): Promise<void> => {
    if (inFlight === 0) return Promise.resolve();
    return new Promise((resolve) => {
      completionWaiters.push(resolve);
    });
  };

  const startTask = (task: JsonMap) => {
    inFlight++;
    void deps
      .runClaimedTask(task)
      .catch(() => {
        /* runClaimedTask 自行处理 retry；此处避免未捕获 rejection */
      })
      .finally(() => {
        inFlight--;
        notifyCompletion();
      });
  };

  const fillSlots = async (): Promise<number> => {
    let started = 0;
    while (inFlight < max) {
      const batch = await deps.claimTasks(max - inFlight);
      if (batch.length === 0) break;
      for (const task of batch) {
        if (inFlight >= max) break;
        startTask(task);
        started++;
      }
    }
    return started;
  };

  while (true) {
    await deps.onTick();

    const started = await fillSlots();
    if (started > 0) drainEmptyCount = 0;

    if (inFlight === 0) {
      if (deps.drainIdleLoops <= 0) {
        await new Promise((r) => setTimeout(r, deps.loopSleepMs));
        continue;
      }
      drainEmptyCount++;
      if (drainEmptyCount >= deps.drainIdleLoops) break;
      await new Promise((r) => setTimeout(r, deps.loopSleepMs));
      continue;
    }

    await waitForCompletion();
  }
}
