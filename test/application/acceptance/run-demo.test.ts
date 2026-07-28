import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ShellRunner } from "../../../src/domain/ports/shell-runner.js";
import { initProgressFromSpec } from "../../../src/application/acceptance/progress-store.js";
import {
  DemoBlockedError,
  runDemo,
} from "../../../src/application/acceptance/run-demo.js";
import { getAcceptanceStatus } from "../../../src/application/acceptance/status.js";
import type {
  AcceptanceItemSpec,
  AcceptanceProgress,
  AcceptanceSpec,
} from "../../../src/application/acceptance/types.js";

// ── 测试辅助 ──────────────────────────────────────────────────────────

const nowIso = "2026-07-29T12:00:00.000Z";

function validSpec(overrides?: Partial<AcceptanceSpec>): AcceptanceSpec {
  return {
    poc_id: "test-poc",
    code_root: "./test-poc",
    demo: {
      id: "smoke",
      how: "Run the smoke test",
      verify: 'node -e "process.exit(0)"',
    },
    items: [
      {
        id: "ac-1",
        title: "First check",
        verify: "npm test",
        needs_human: false,
        depends_on: [],
      },
    ],
    ...overrides,
  };
}

function machineItem(
  overrides?: Partial<AcceptanceItemSpec>,
): AcceptanceItemSpec {
  return {
    id: "ac-machine",
    title: "Machine check",
    verify: "node -e 'process.exit(0)'",
    needs_human: false,
    depends_on: [],
    ...overrides,
  };
}

function makeProgress(
  spec: AcceptanceSpec,
  overrides?: Partial<AcceptanceProgress>,
): AcceptanceProgress {
  const base = initProgressFromSpec(spec, "2026-07-29T00:00:00.000Z");
  return { ...base, ...overrides };
}

/** 创建返回指定 exit code 的 mock ShellRunner */
function mockShellRunner(
  exitCode: number,
  output = "mock output",
): ShellRunner {
  return vi.fn(async (_cmd, _opts?) => ({ exitCode, output }));
}

/** 创建会记录调用参数并返回指定 exit code 的 mock ShellRunner */
function capturingShellRunner(
  exitCode: number,
): { runner: ShellRunner; calls: Array<{ cmd: string; opts: unknown }> } {
  const calls: Array<{ cmd: string; opts: unknown }> = [];
  const runner = vi.fn(async (cmd: string, opts?: unknown) => {
    calls.push({ cmd, opts });
    return { exitCode, output: "captured" };
  });
  return { runner, calls };
}

// ── runDemo ────────────────────────────────────────────────────────────

describe("runDemo", () => {
  // ── 前置校验：item 未全部 pass ──────────────────────────────────

  it("throws DemoBlockedError when any item is not pass", async () => {
    const spec = validSpec({
      items: [
        machineItem({ id: "a" }),
        machineItem({ id: "b" }),
      ],
    });
    const progress = makeProgress(spec);
    // "a" done → pass, "b" still pending
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
    ]);

    await expect(
      runDemo({
        progress,
        taskStatuses,
        farmRoot: "/farm",
        runShell: mockShellRunner(0),
        nowIso,
      }),
    ).rejects.toThrow(DemoBlockedError);
  });

  it("DemoBlockedError lists all failing item ids", async () => {
    const spec = validSpec({
      items: [
        machineItem({ id: "a" }),
        machineItem({ id: "b" }),
        machineItem({ id: "c" }),
      ],
    });
    const progress = makeProgress(spec);
    // Only "a" is done
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
    ]);

    let caught: DemoBlockedError | null = null;
    try {
      await runDemo({
        progress,
        taskStatuses,
        farmRoot: "/farm",
        runShell: mockShellRunner(0),
        nowIso,
      });
    } catch (e) {
      caught = e as DemoBlockedError;
    }

    expect(caught).toBeInstanceOf(DemoBlockedError);
    expect(caught!.failingItemIds).toContain("b");
    expect(caught!.failingItemIds).toContain("c");
    expect(caught!.failingItemIds).not.toContain("a");
    expect(caught!.message).toContain("b");
    expect(caught!.message).toContain("c");
  });

  it("does NOT throw when all items pass (after reconcile)", async () => {
    const spec = validSpec({
      items: [
        machineItem({ id: "a" }),
        machineItem({ id: "b" }),
      ],
    });
    const progress = makeProgress(spec);
    // All done
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
      ["acceptance__test-poc__b", "done"],
    ]);

    const { runner } = capturingShellRunner(0);

    await expect(
      runDemo({
        progress,
        taskStatuses,
        farmRoot: "/farm",
        runShell: runner,
        nowIso,
      }),
    ).resolves.toBeDefined();
  });

  // ── demo 执行结果 ───────────────────────────────────────────────

  it("returns passed=true and demo=pass on exit 0", async () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
    ]);

    const result = await runDemo({
      progress,
      taskStatuses,
      farmRoot: "/farm",
      runShell: mockShellRunner(0, "all good"),
      nowIso,
    });

    expect(result.passed).toBe(true);
    expect(result.output).toBe("all good");
    expect(result.progress.demo).toBe("pass");
  });

  it("returns passed=false and demo=fail on non-zero exit", async () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
    ]);

    const result = await runDemo({
      progress,
      taskStatuses,
      farmRoot: "/farm",
      runShell: mockShellRunner(1, "something broke"),
      nowIso,
    });

    expect(result.passed).toBe(false);
    expect(result.output).toBe("something broke");
    expect(result.progress.demo).toBe("fail");
  });

  // ── cwd 解析 ───────────────────────────────────────────────────

  it("resolves relative code_root against farmRoot for cwd", async () => {
    const spec = validSpec({
      code_root: "./my-poc",
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
    ]);

    const { runner, calls } = capturingShellRunner(0);

    await runDemo({
      progress,
      taskStatuses,
      farmRoot: "/farm/root",
      runShell: runner,
      nowIso,
    });

    expect(calls).toHaveLength(1);
    // The command should cd into the resolved cwd (platform-dependent separators)
    const expectedCwd = path.resolve("/farm/root", "./my-poc");
    expect(calls[0].cmd).toContain(expectedCwd);
  });

  it("uses absolute code_root as-is for cwd", async () => {
    const spec = validSpec({
      code_root: "/absolute/path/to/poc",
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
    ]);

    const { runner, calls } = capturingShellRunner(0);

    await runDemo({
      progress,
      taskStatuses,
      farmRoot: "/farm/root",
      runShell: runner,
      nowIso,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toContain("/absolute/path/to/poc");
    expect(calls[0].cmd).not.toContain("/farm/root");
  });

  it("runs the demo.verify command via runAcceptanceCheck", async () => {
    const spec = validSpec({
      demo: {
        id: "smoke",
        verify: "npm run test:smoke",
      },
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
    ]);

    const { runner, calls } = capturingShellRunner(0);

    await runDemo({
      progress,
      taskStatuses,
      farmRoot: "/farm",
      runShell: runner,
      nowIso,
    });

    expect(calls).toHaveLength(1);
    // The shell command should contain the verify command
    expect(calls[0].cmd).toContain("npm run test:smoke");
  });

  // ── 进度更新 ───────────────────────────────────────────────────

  it("updates progress items via reconcile before checking demo", async () => {
    const spec = validSpec({
      items: [
        machineItem({ id: "a" }),
        machineItem({ id: "b" }),
      ],
    });
    const progress = makeProgress(spec);
    // Both done → reconcile will set both to pass
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
      ["acceptance__test-poc__b", "done"],
    ]);

    const result = await runDemo({
      progress,
      taskStatuses,
      farmRoot: "/farm",
      runShell: mockShellRunner(0),
      nowIso,
    });

    // Items should be updated to pass
    expect(result.progress.items["a"]).toBe("pass");
    expect(result.progress.items["b"]).toBe("pass");
  });

  it("does not mutate the input progress", async () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const originalItems = { ...progress.items };
    const originalDemo = progress.demo;
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
    ]);

    await runDemo({
      progress,
      taskStatuses,
      farmRoot: "/farm",
      runShell: mockShellRunner(0),
      nowIso,
    });

    // Original progress should be unchanged
    expect(progress.items).toEqual(originalItems);
    expect(progress.demo).toBe(originalDemo);
  });

  // ── timeoutMs 透传 ─────────────────────────────────────────────

  it("passes timeoutMs to runAcceptanceCheck", async () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
    ]);

    const { runner, calls } = capturingShellRunner(0);

    await runDemo({
      progress,
      taskStatuses,
      farmRoot: "/farm",
      runShell: runner,
      nowIso,
      timeoutMs: 30_000,
    });

    expect(calls).toHaveLength(1);
    expect((calls[0].opts as Record<string, unknown>)?.timeoutMs).toBe(30_000);
  });

  // ── 含 human item 场景 ─────────────────────────────────────────

  it("human item in review state does not block demo if it has pass via approved", async () => {
    const spec = validSpec({
      items: [
        machineItem({ id: "a" }),
        {
          id: "human-1",
          title: "Needs human",
          verify: null,
          needs_human: true,
          depends_on: [],
        },
      ],
    });
    const progress = makeProgress(spec);
    // Both done → both pass (human item done also maps to pass)
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
      ["acceptance__test-poc__human-1", "approved"],
    ]);

    const result = await runDemo({
      progress,
      taskStatuses,
      farmRoot: "/farm",
      runShell: mockShellRunner(0),
      nowIso,
    });

    expect(result.passed).toBe(true);
    expect(result.progress.items["human-1"]).toBe("pass");
  });

  it("human item in awaiting_human blocks demo", async () => {
    const spec = validSpec({
      items: [
        machineItem({ id: "a" }),
        {
          id: "human-1",
          title: "Needs human",
          verify: null,
          needs_human: true,
          depends_on: [],
        },
      ],
    });
    const progress = makeProgress(spec);
    // "a" done → pass, but "human-1" is in review → awaiting_human
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
      ["acceptance__test-poc__human-1", "review"],
    ]);

    await expect(
      runDemo({
        progress,
        taskStatuses,
        farmRoot: "/farm",
        runShell: mockShellRunner(0),
        nowIso,
      }),
    ).rejects.toThrow(DemoBlockedError);
  });

  // ── demo 状态暂态 ──────────────────────────────────────────────

  it("returns progress with demo state reflecting final result (not running)", async () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
    ]);

    const result = await runDemo({
      progress,
      taskStatuses,
      farmRoot: "/farm",
      runShell: mockShellRunner(0),
      nowIso,
    });

    // Demo should be pass (final), not running
    expect(result.progress.demo).toBe("pass");
  });

  it("returns progress with demo=fail when verify fails", async () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
    ]);

    const result = await runDemo({
      progress,
      taskStatuses,
      farmRoot: "/farm",
      runShell: mockShellRunner(2),
      nowIso,
    });

    expect(result.progress.demo).toBe("fail");
    expect(result.passed).toBe(false);
  });

  // ── 多次 reconcile ──────────────────────────────────────────────

  it("unblocks chain-dependency items during reconcile before demo check", async () => {
    const spec = validSpec({
      items: [
        machineItem({ id: "a" }),
        { id: "b", title: "B", verify: "cmd", needs_human: false, depends_on: ["a"] },
      ],
    });
    const progress = makeProgress(spec);
    // "a" done → pass; "b" was blocked → reconcile unblocks it but no taskStatus for "b"
    // So "b" is still pending (not pass) → demo blocked
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
    ]);

    await expect(
      runDemo({
        progress,
        taskStatuses,
        farmRoot: "/farm",
        runShell: mockShellRunner(0),
        nowIso,
      }),
    ).rejects.toThrow(DemoBlockedError);
  });
});

// ── getAcceptanceStatus ────────────────────────────────────────────────

describe("getAcceptanceStatus", () => {
  it("done=true when all items pass and demo pass", () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec, {
      items: { a: "pass" },
      demo: "pass",
    } as Partial<AcceptanceProgress>);
    const taskStatuses = new Map<string, string>();

    const result = getAcceptanceStatus({ progress, taskStatuses, nowIso });

    expect(result.done).toBe(true);
  });

  it("done=false when not all items pass", () => {
    const spec = validSpec({
      items: [
        machineItem({ id: "a" }),
        machineItem({ id: "b" }),
      ],
    });
    const progress = makeProgress(spec, {
      items: { a: "pass", b: "pending" },
      demo: "pass",
    } as Partial<AcceptanceProgress>);
    const taskStatuses = new Map<string, string>();

    const result = getAcceptanceStatus({ progress, taskStatuses, nowIso });

    expect(result.done).toBe(false);
  });

  it("done=false when all items pass but demo not pass", () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec, {
      items: { a: "pass" },
      demo: "ready",
    } as Partial<AcceptanceProgress>);
    const taskStatuses = new Map<string, string>();

    const result = getAcceptanceStatus({ progress, taskStatuses, nowIso });

    expect(result.done).toBe(false);
  });

  it("done=false when demo pass but items not all pass", () => {
    const spec = validSpec({
      items: [
        machineItem({ id: "a" }),
        machineItem({ id: "b" }),
      ],
    });
    const progress = makeProgress(spec, {
      items: { a: "pass", b: "fail" },
      demo: "pass",
    } as Partial<AcceptanceProgress>);
    const taskStatuses = new Map<string, string>();

    const result = getAcceptanceStatus({ progress, taskStatuses, nowIso });

    expect(result.done).toBe(false);
  });

  it("reconciles task statuses before checking done", () => {
    const spec = validSpec({
      items: [
        machineItem({ id: "a" }),
        machineItem({ id: "b" }),
      ],
    });
    const progress = makeProgress(spec);
    // "a" and "b" both done → reconcile sets to pass; demo starts locked
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
      ["acceptance__test-poc__b", "done"],
    ]);

    const result = getAcceptanceStatus({ progress, taskStatuses, nowIso });

    // Items are now pass, but demo is still locked → done=false
    expect(result.progress.items["a"]).toBe("pass");
    expect(result.progress.items["b"]).toBe("pass");
    expect(result.progress.demo).toBe("ready");
    expect(result.done).toBe(false);
  });

  it("done=true after reconcile when everything resolves to pass", () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    // "a" done → pass
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
    ]);
    // Pre-set demo to pass so done=true
    progress.demo = "pass";

    const result = getAcceptanceStatus({ progress, taskStatuses, nowIso });

    expect(result.done).toBe(true);
  });

  it("does not mutate input progress", () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const originalItems = { ...progress.items };
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
    ]);

    getAcceptanceStatus({ progress, taskStatuses, nowIso });

    expect(progress.items).toEqual(originalItems);
  });

  it("returns reconciled progress in result", () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
    ]);

    const result = getAcceptanceStatus({ progress, taskStatuses, nowIso });

    // Result contains the reconciled progress (item updated to pass)
    expect(result.progress.items["a"]).toBe("pass");
  });

  it("demo=fail with all items pass → done=false", () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec, {
      items: { a: "pass" },
      demo: "fail",
    } as Partial<AcceptanceProgress>);
    const taskStatuses = new Map<string, string>();

    const result = getAcceptanceStatus({ progress, taskStatuses, nowIso });

    expect(result.done).toBe(false);
  });

  it("human item that resolves to pass counts toward done", () => {
    const spec = validSpec({
      items: [
        machineItem({ id: "a" }),
        {
          id: "human-1",
          title: "Needs human",
          verify: null,
          needs_human: true,
          depends_on: [],
        },
      ],
    });
    const progress = makeProgress(spec);
    const taskStatuses = new Map([
      ["acceptance__test-poc__a", "done"],
      ["acceptance__test-poc__human-1", "done"],
    ]);
    // Pre-set demo to pass
    progress.demo = "pass";

    const result = getAcceptanceStatus({ progress, taskStatuses, nowIso });

    // Both map to pass via reconcile
    expect(result.progress.items["a"]).toBe("pass");
    expect(result.progress.items["human-1"]).toBe("pass");
    expect(result.done).toBe(true);
  });
});
