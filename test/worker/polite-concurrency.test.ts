import { describe, expect, it } from "vitest";
import { createGate, createWorktreeGate, createPostInstallGate, randomJitterMs } from "../../src/application/worker/polite-concurrency.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("createGate", () => {
  it("acquire returns a release function that decrements inFlight", async () => {
    const gate = createGate(2);
    const r1 = await gate.acquire();
    const r2 = await gate.acquire();

    // 此时槽位已满，第三个 acquire 应排队
    let acquired = false;
    const p3 = gate.acquire().then((r) => {
      acquired = true;
      return r;
    });

    await sleep(10);
    expect(acquired).toBe(false);

    r1();
    const r3 = await p3;
    expect(acquired).toBe(true);

    r2();
    r3();
  });

  it("enforces max concurrency: 3 acquires with max=2, only 2 pass, 3rd waits", async () => {
    const gate = createGate(2);
    const running = new Set<number>();
    const order: number[] = [];

    async function worker(id: number) {
      const release = await gate.acquire();
      running.add(id);
      order.push(id);
      await sleep(20);
      running.delete(id);
      release();
    }

    const w1 = worker(1);
    const w2 = worker(2);
    const w3 = worker(3);

    await sleep(5);
    // 前两个应已进入
    expect(running.size).toBeLessThanOrEqual(2);

    await Promise.all([w1, w2, w3]);
    expect(order.length).toBe(3);
  });

  it("wakes waiters in FIFO order", async () => {
    const gate = createGate(1);
    const order: number[] = [];

    const r1 = await gate.acquire();
    expect(r1).toBeTypeOf("function");

    const p2 = gate.acquire().then((r) => {
      order.push(2);
      return r;
    });
    const p3 = gate.acquire().then((r) => {
      order.push(3);
      return r;
    });

    await sleep(10);
    expect(order).toEqual([]); // both waiting

    r1(); // wakes p2
    const r2 = await p2;
    expect(order).toEqual([2]);

    r2(); // wakes p3
    const r3 = await p3;
    expect(order).toEqual([2, 3]);

    r3();
  });

  it("allows re-acquire after release", async () => {
    const gate = createGate(2);
    const r1 = await gate.acquire();
    const r2 = await gate.acquire();
    r1();
    r2();

    // 槽位应全部释放
    const r3 = await gate.acquire();
    const r4 = await gate.acquire();
    expect(r3).toBeTypeOf("function");
    expect(r4).toBeTypeOf("function");
    r3();
    r4();
  });

  it("max=1 behaves as a mutex", async () => {
    const gate = createGate(1);
    const running: number[] = [];

    async function critical(id: number) {
      const release = await gate.acquire();
      running.push(id);
      await sleep(15);
      running.pop();
      release();
    }

    const results = await Promise.all([critical(1), critical(2), critical(3)]);
    // all should complete
    expect(results).toHaveLength(3);
  });

  it("release after acquire error does not break the gate", async () => {
    const gate = createGate(1);
    const r1 = await gate.acquire();

    let p2resolved = false;
    const p2 = gate.acquire().then((r) => {
      p2resolved = true;
      r();
    });

    await sleep(5);
    expect(p2resolved).toBe(false);

    r1(); // release, wakes p2
    await p2;
    expect(p2resolved).toBe(true);

    // gate should still work
    const r3 = await gate.acquire();
    expect(r3).toBeTypeOf("function");
    r3();
  });
});

describe("createWorktreeGate", () => {
  it("defaults to max=2", async () => {
    const gate = createWorktreeGate();
    const r1 = await gate.acquire();
    const r2 = await gate.acquire();

    let third = false;
    const p3 = gate.acquire().then(() => { third = true; });
    await sleep(10);
    expect(third).toBe(false);

    r1(); r2();
    await p3;
  });

  it("accepts custom max", async () => {
    const gate = createWorktreeGate(3);
    const releases: Array<() => void> = [];
    for (let i = 0; i < 3; i++) {
      releases.push(await gate.acquire());
    }
    let fourth = false;
    const p4 = gate.acquire().then(() => { fourth = true; });
    await sleep(10);
    expect(fourth).toBe(false);

    for (const r of releases) r();
    await p4;
  });
});

describe("createPostInstallGate", () => {
  it("defaults to max=1", async () => {
    const gate = createPostInstallGate();
    const r1 = await gate.acquire();

    let second = false;
    const p2 = gate.acquire().then(() => { second = true; });
    await sleep(10);
    expect(second).toBe(false);

    r1();
    await p2;
  });

  it("accepts custom max", async () => {
    const gate = createPostInstallGate(2);
    const r1 = await gate.acquire();
    const r2 = await gate.acquire();

    let third = false;
    const p3 = gate.acquire().then(() => { third = true; });
    await sleep(10);
    expect(third).toBe(false);

    r1(); r2();
    await p3;
  });
});

describe("randomJitterMs", () => {
  it("returns 0 when maxMs is 0", () => {
    for (let i = 0; i < 20; i++) {
      expect(randomJitterMs(0)).toBe(0);
    }
  });

  it("returns 0 when maxMs is negative", () => {
    for (let i = 0; i < 20; i++) {
      expect(randomJitterMs(-1)).toBe(0);
    }
  });

  it("returns values in [0, maxMs)", () => {
    const maxMs = 2000;
    for (let i = 0; i < 100; i++) {
      const v = randomJitterMs(maxMs);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(maxMs);
    }
  });

  it("returns integer values", () => {
    for (let i = 0; i < 50; i++) {
      const v = randomJitterMs(100);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("produces varying values (non-deterministic spot check)", () => {
    const values = new Set<number>();
    for (let i = 0; i < 50; i++) {
      values.add(randomJitterMs(100));
    }
    // With 50 samples in [0, 100), we should get multiple distinct values
    expect(values.size).toBeGreaterThan(1);
  });
});
