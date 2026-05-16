import { describe, expect, it } from "vitest";
import { runWorkerPoolLoop } from "../../src/application/worker/worker-pool-loop.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("runWorkerPoolLoop", () => {
  it("backfills claim slots when a fast task finishes before a slow peer", async () => {
    const pending = ["t1", "t2", "t3", "t4-slow", "t5", "t6", "t7"].map((task_id) => ({ task_id }));
    const startedAt = new Map<string, number>();
    const finishedAt = new Map<string, number>();

    await runWorkerPoolLoop({
      maxConcurrency: 4,
      loopSleepMs: 0,
      drainIdleLoops: 1,
      onTick: async () => {},
      claimTasks: async (limit) => pending.splice(0, limit),
      runClaimedTask: async (task) => {
        const id = String(task.task_id);
        startedAt.set(id, Date.now());
        await sleep(id === "t4-slow" ? 80 : 5);
        finishedAt.set(id, Date.now());
      },
    });

    expect(startedAt.has("t5")).toBe(true);
    expect(finishedAt.has("t4-slow")).toBe(true);
    expect(startedAt.get("t5")!).toBeLessThan(finishedAt.get("t4-slow")!);
    expect(pending).toHaveLength(0);
  });

  it("drains after consecutive empty claim cycles with no in-flight work", async () => {
    let ticks = 0;
    await runWorkerPoolLoop({
      maxConcurrency: 2,
      loopSleepMs: 0,
      drainIdleLoops: 2,
      onTick: async () => {
        ticks++;
      },
      claimTasks: async () => [],
      runClaimedTask: async () => {},
    });
    expect(ticks).toBeGreaterThanOrEqual(2);
  });
});
