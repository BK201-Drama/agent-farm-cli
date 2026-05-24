/**
 * 并发门：限制同时执行的操作数。
 *
 * acquire/release 契约：
 * - `acquire()` 返回 `Promise<release>`，调用方获得槽位后方可执行受保护的操作。
 * - `release()` 归还槽位，允许下一个等待者进入。必须调用，否则槽位泄漏、
 *   后续调用方永久阻塞。
 * - 调用方应在 `try {} finally { release(); }` 中释放，确保异常路径也归还。
 * - `release()` 是幂等的 —— 重复调用安全，第二次及之后为 no-op，`inFlight`
 *   绝不会因重复释放而变为负数。
 */
export type Gate = {
  acquire: () => Promise<() => void>;
};

/**
 * 基于 Promise 队列的互斥门，保证最多 `maxConcurrency` 个调用方同时持有槽位。
 *
 * 超出上限的调用方排队等待，先到先得。每次 `acquire()` 返回独立的 release 函数，
 * 各自幂等 —— 多次调用同一个 release 不会重复归还槽位，也不会错误地释放其他
 * 调用方持有的槽位。
 *
 * @param maxConcurrency 最大并发数，必须 >= 1
 */
export function createGate(maxConcurrency: number): Gate {
  let inFlight = 0;
  const waiters: Array<() => void> = [];

  function makeRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      // 防御性 guard：防止在异常状态下 inFlight 变为负数
      if (inFlight <= 0) return;
      inFlight--;
      const next = waiters.shift();
      if (next) {
        inFlight++;
        next();
      }
    };
  }

  const acquire = (): Promise<() => void> => {
    const rel = makeRelease();
    if (inFlight < maxConcurrency) {
      inFlight++;
      return Promise.resolve(rel);
    }
    return new Promise<() => void>((resolve) => {
      waiters.push(() => resolve(rel));
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
