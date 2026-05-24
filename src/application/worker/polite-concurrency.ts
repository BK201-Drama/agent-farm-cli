export type Gate = {
  /** 获取一个执行槽位，返回释放函数。调用方必须在 finally 中调用 release。 */
  acquire: () => Promise<() => void>;
};

/**
 * 基于 Promise 队列的互斥门，保证最多 `maxConcurrency` 个调用方同时持有槽位。
 * 超出上限的调用方排队等待，先到先得。
 */
export function createGate(maxConcurrency: number): Gate {
  let inFlight = 0;
  const waiters: Array<() => void> = [];

  const release = () => {
    inFlight--;
    const next = waiters.shift();
    if (next) {
      inFlight++;
      next();
    }
  };

  const acquire = (): Promise<() => void> => {
    if (inFlight < maxConcurrency) {
      inFlight++;
      return Promise.resolve(release);
    }
    return new Promise<() => void>((resolve) => {
      waiters.push(() => resolve(release));
    });
  };

  return { acquire };
}

/** Worktree 创建门：默认最多 2 个 worker 同时创建 worktree */
export function createWorktreeGate(max?: number): Gate {
  return createGate(max ?? 2);
}

/** npm install 门：默认最多 1 个 worker 同时执行 npm install */
export function createPostInstallGate(max?: number): Gate {
  return createGate(max ?? 1);
}

/** 返回 [0, maxMs) 之间的随机毫秒数 */
export function randomJitterMs(maxMs: number): number {
  if (maxMs <= 0) return 0;
  return Math.floor(Math.random() * maxMs);
}
