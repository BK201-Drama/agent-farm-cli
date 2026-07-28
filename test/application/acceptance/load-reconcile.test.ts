import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { JsonMap, TaskRecord } from "../../../src/domain/task/model.js";
import { buildTaskForItem } from "../../../src/application/acceptance/task-factory.js";
import { loadAcceptanceSpec } from "../../../src/application/acceptance/load-acceptance.js";
import { reconcileAcceptanceProgress } from "../../../src/application/acceptance/reconcile.js";
import { initProgressFromSpec } from "../../../src/application/acceptance/progress-store.js";
import type {
  AcceptanceItemSpec,
  AcceptanceProgress,
  AcceptanceSpec,
} from "../../../src/application/acceptance/types.js";

// ── 测试辅助 ──────────────────────────────────────────────────────────

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

function machineItem(overrides?: Partial<AcceptanceItemSpec>): AcceptanceItemSpec {
  return {
    id: "ac-machine",
    title: "Machine check",
    verify: "node -e 'process.exit(0)'",
    needs_human: false,
    depends_on: [],
    ...overrides,
  };
}

function humanItem(overrides?: Partial<AcceptanceItemSpec>): AcceptanceItemSpec {
  return {
    id: "ac-human",
    title: "Needs human judgment",
    verify: null,
    needs_human: true,
    depends_on: [],
    ...overrides,
  };
}

function mockEnqueue(calls: JsonMap[] = []) {
  return vi.fn(async (task: JsonMap): Promise<TaskRecord> => {
    calls.push(task);
    return { ...task, status: "queued", created_at: new Date().toISOString() } as TaskRecord;
  });
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "af-load-reconcile-"));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function writeSpecJson(dir: string, spec: AcceptanceSpec): Promise<string> {
  const filePath = path.join(dir, "spec.json");
  await fs.writeFile(filePath, JSON.stringify(spec, null, 2), "utf-8");
  return filePath;
}

// ── buildTaskForItem ───────────────────────────────────────────────────

describe("buildTaskForItem", () => {
  const spec = validSpec();

  it("sets task_id and dedupe_key as acceptance__{poc_id}__{item.id}", () => {
    const item = machineItem({ id: "check-1" });
    const task = buildTaskForItem(spec, item);

    expect(task.task_id).toBe("acceptance__test-poc__check-1");
    expect(task.dedupe_key).toBe("acceptance__test-poc__check-1");
  });

  it("sanitizes colons in poc/item so Windows can mkdir runs/", () => {
    const s = validSpec({ poc_id: "poc:x" });
    const task = buildTaskForItem(s, machineItem({ id: "a:b" }));
    expect(task.task_id).toBe("acceptance__poc-x__a-b");
    expect(String(task.task_id)).not.toMatch(/:/);
  });

  it("sets mode to execute", () => {
    const task = buildTaskForItem(spec, machineItem());
    expect(task.mode).toBe("execute");
  });

  it("includes prompt with item title", () => {
    const item = machineItem({ title: "Verify database schema" });
    const task = buildTaskForItem(spec, item);
    expect(task.prompt).toBe("Acceptance check: Verify database schema");
  });

  it("sets acceptance_criteria when needs_human is false", () => {
    const item = machineItem({ verify: "npm run test:e2e" });
    const task = buildTaskForItem(spec, item);
    expect(task.acceptance_criteria).toBe("npm run test:e2e");
  });

  it("does NOT set acceptance_criteria when needs_human is true", () => {
    const item = humanItem();
    const task = buildTaskForItem(spec, item);
    expect(task.acceptance_criteria).toBeUndefined();
  });

  it("always includes spec_acceptance metadata", () => {
    const item = machineItem({ id: "check-1", needs_human: false });
    const task = buildTaskForItem(spec, item);

    expect(task.spec_acceptance).toEqual({
      poc_id: "test-poc",
      item_id: "check-1",
      needs_human: false,
    });
  });

  it("spec_acceptance reflects needs_human: true", () => {
    const item = humanItem({ id: "human-1", needs_human: true });
    const task = buildTaskForItem(spec, item);

    expect(task.spec_acceptance).toEqual({
      poc_id: "test-poc",
      item_id: "human-1",
      needs_human: true,
    });
  });

  it("sets read_path from spec.code_root", () => {
    const s = validSpec({ code_root: "./my-project" });
    const task = buildTaskForItem(s, machineItem());
    expect(task.read_path).toBe("./my-project");
  });
});

// ── loadAcceptanceSpec ─────────────────────────────────────────────────

describe("loadAcceptanceSpec", () => {
  it("reads a spec JSON, initializes progress, and enqueues pending items", () =>
    withTempDir(async (dir) => {
      const spec = validSpec({
        items: [
          { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
          { id: "b", title: "B", verify: "cmd", needs_human: false, depends_on: ["a"] },
        ],
      });
      const specPath = await writeSpecJson(dir, spec);
      const calls: JsonMap[] = [];
      const enqueue = mockEnqueue(calls);

      const result = await loadAcceptanceSpec({
        specFilePath: specPath,
        farmRoot: dir,
        enqueue,
      });

      // Only "a" is pending; "b" is blocked
      expect(calls).toHaveLength(1);
      expect(calls[0].task_id).toBe("acceptance__test-poc__a");
      expect(result.enqueuedCount).toBe(1);
      expect(result.spec.poc_id).toBe("test-poc");
      expect(result.progress.items["a"]).toBe("pending");
      expect(result.progress.items["b"]).toBe("blocked");
      expect(result.progress.demo).toBe("locked");
    }));

  it("is idempotent: skips enqueue when dedupe_key already exists", () =>
    withTempDir(async (dir) => {
      const spec = validSpec({
        items: [
          { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
        ],
      });
      const specPath = await writeSpecJson(dir, spec);
      const calls: JsonMap[] = [];
      const enqueue = mockEnqueue(calls);

      const first = await loadAcceptanceSpec({
        specFilePath: specPath,
        farmRoot: dir,
        enqueue,
      });
      expect(first.enqueuedCount).toBe(1);

      const second = await loadAcceptanceSpec({
        specFilePath: specPath,
        farmRoot: dir,
        enqueue,
        existingDedupeKeys: new Set(["acceptance__test-poc__a"]),
      });
      expect(second.enqueuedCount).toBe(0);
      expect(second.skippedExistingCount).toBe(1);
      expect(calls).toHaveLength(1);
    }));

  it("enqueues all items when none have dependencies", () =>
    withTempDir(async (dir) => {
      const spec = validSpec({
        items: [
          { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
          { id: "b", title: "B", verify: "cmd", needs_human: false, depends_on: [] },
          { id: "c", title: "C", verify: "cmd", needs_human: false, depends_on: [] },
        ],
      });
      const specPath = await writeSpecJson(dir, spec);
      const calls: JsonMap[] = [];
      const enqueue = mockEnqueue(calls);

      const result = await loadAcceptanceSpec({
        specFilePath: specPath,
        farmRoot: dir,
        enqueue,
      });

      expect(calls).toHaveLength(3);
      expect(result.enqueuedCount).toBe(3);
    }));

  it("enqueues zero items when all are blocked by deps", () =>
    withTempDir(async (dir) => {
      const spec = validSpec({
        items: [
          { id: "root", title: "Root", verify: "cmd", needs_human: false, depends_on: [] },
          { id: "mid", title: "Mid", verify: "cmd", needs_human: false, depends_on: ["root"] },
          { id: "leaf", title: "Leaf", verify: "cmd", needs_human: false, depends_on: ["mid"] },
        ],
      });
      const specPath = await writeSpecJson(dir, spec);
      const calls: JsonMap[] = [];
      const enqueue = mockEnqueue(calls);

      const result = await loadAcceptanceSpec({
        specFilePath: specPath,
        farmRoot: dir,
        enqueue,
      });

      // Only "root" is pending
      expect(calls).toHaveLength(1);
      expect(result.enqueuedCount).toBe(1);
      expect(result.progress.items["root"]).toBe("pending");
      expect(result.progress.items["mid"]).toBe("blocked");
      expect(result.progress.items["leaf"]).toBe("blocked");
    }));

  it("writes progress file to .agent-farm/acceptance/{pocId}.json", () =>
    withTempDir(async (dir) => {
      const spec = validSpec({
        items: [
          { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
        ],
      });
      const specPath = await writeSpecJson(dir, spec);
      const enqueue = mockEnqueue();

      await loadAcceptanceSpec({
        specFilePath: specPath,
        farmRoot: dir,
        enqueue,
      });

      const progressPath = path.join(dir, ".agent-farm", "acceptance", "test-poc.json");
      const raw = await fs.readFile(progressPath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.poc_id).toBe("test-poc");
      expect(parsed.items["a"]).toBe("pending");
      expect(parsed.demo).toBe("locked");
    }));

  it("throws on invalid spec JSON (parse error)", () =>
    withTempDir(async (dir) => {
      const badPath = path.join(dir, "bad.json");
      await fs.writeFile(badPath, "not json", "utf-8");
      const enqueue = mockEnqueue();

      await expect(
        loadAcceptanceSpec({
          specFilePath: badPath,
          farmRoot: dir,
          enqueue,
        }),
      ).rejects.toThrow();
    }));

  it("throws on missing file", () =>
    withTempDir(async (dir) => {
      const enqueue = mockEnqueue();
      await expect(
        loadAcceptanceSpec({
          specFilePath: path.join(dir, "nonexistent.json"),
          farmRoot: dir,
          enqueue,
        }),
      ).rejects.toThrow();
    }));
});

// ── reconcileAcceptanceProgress ────────────────────────────────────────

describe("reconcileAcceptanceProgress", () => {
  const nowIso = "2026-07-29T12:00:00.000Z";

  function makeProgress(spec: AcceptanceSpec, overrides?: Partial<AcceptanceProgress>): AcceptanceProgress {
    const base = initProgressFromSpec(spec, "2026-07-29T00:00:00.000Z");
    return { ...base, ...overrides };
  }

  // ── 状态映射 ───────────────────────────────────────────────────

  it("maps done → pass", () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const statuses = new Map([["acceptance__test-poc__a", "done"]]);

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    expect(result.progress.items["a"]).toBe("pass");
    expect(result.changes).toContainEqual({ itemId: "a", from: "pending", to: "pass" });
  });

  it("maps approved → pass", () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const statuses = new Map([["acceptance__test-poc__a", "approved"]]);

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    expect(result.progress.items["a"]).toBe("pass");
  });

  it("maps review + needs_human → awaiting_human", () => {
    const spec = validSpec({
      items: [humanItem({ id: "a", needs_human: true })],
    });
    const progress = makeProgress(spec);
    const statuses = new Map([["acceptance__test-poc__a", "review"]]);

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    expect(result.progress.items["a"]).toBe("awaiting_human");
    expect(result.changes).toContainEqual({ itemId: "a", from: "pending", to: "awaiting_human" });
  });

  it("review + !needs_human → no change (keeps current state)", () => {
    const spec = validSpec({
      items: [machineItem({ id: "a", needs_human: false })],
    });
    const progress = makeProgress(spec);
    // Manually set to running so we can detect no change
    progress.items["a"] = "running";
    const statuses = new Map([["acceptance__test-poc__a", "review"]]);

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    // For machine items, review state doesn't map — stays running
    expect(result.progress.items["a"]).toBe("running");
    expect(result.changes).toHaveLength(0);
  });

  it("maps running → running", () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const statuses = new Map([["acceptance__test-poc__a", "running"]]);

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    expect(result.progress.items["a"]).toBe("running");
    expect(result.changes).toContainEqual({ itemId: "a", from: "pending", to: "running" });
  });

  it("maps failed → fail", () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const statuses = new Map([["acceptance__test-poc__a", "failed"]]);

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    expect(result.progress.items["a"]).toBe("fail");
    expect(result.changes).toContainEqual({ itemId: "a", from: "pending", to: "fail" });
  });

  it("maps retry → pending", () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    // Manually set to running first
    progress.items["a"] = "running";
    const statuses = new Map([["acceptance__test-poc__a", "retry"]]);

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    expect(result.progress.items["a"]).toBe("pending");
    expect(result.changes).toContainEqual({ itemId: "a", from: "running", to: "pending" });
  });

  it("ignores unknown task statuses (queued, claimed, etc.)", () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const statuses = new Map([["acceptance__test-poc__a", "queued"]]);

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    // queued is not mapped, so no change from "pending"
    expect(result.progress.items["a"]).toBe("pending");
    expect(result.changes).toHaveLength(0);
  });

  it("ignores items not found in taskStatuses", () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const statuses = new Map<string, string>(); // empty

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    expect(result.progress.items["a"]).toBe("pending");
    expect(result.changes).toHaveLength(0);
  });

  // ── 依赖解锁 ───────────────────────────────────────────────────

  it("unblocks items when all dependencies pass", () => {
    const spec = validSpec({
      items: [
        { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
        { id: "b", title: "B", verify: "cmd", needs_human: false, depends_on: ["a"] },
      ],
    });
    const progress = makeProgress(spec);
    // "a" passes, "b" should unblock
    const statuses = new Map([["acceptance__test-poc__a", "done"]]);

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    expect(result.progress.items["a"]).toBe("pass");
    expect(result.progress.items["b"]).toBe("pending");
    expect(result.newlyUnblocked).toHaveLength(1);
    expect(result.newlyUnblocked[0].id).toBe("b");
    expect(result.changes).toContainEqual({ itemId: "a", from: "pending", to: "pass" });
    expect(result.changes).toContainEqual({ itemId: "b", from: "blocked", to: "pending" });
  });

  it("does not unblock when some deps are still not pass", () => {
    const spec = validSpec({
      items: [
        { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
        { id: "b", title: "B", verify: "cmd", needs_human: false, depends_on: [] },
        { id: "c", title: "C", verify: "cmd", needs_human: false, depends_on: ["a", "b"] },
      ],
    });
    const progress = makeProgress(spec);
    // Only "a" passes; "b" is still pending
    const statuses = new Map([["acceptance__test-poc__a", "done"]]);

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    expect(result.progress.items["a"]).toBe("pass");
    expect(result.progress.items["b"]).toBe("pending"); // unchanged
    expect(result.progress.items["c"]).toBe("blocked"); // still blocked
    expect(result.newlyUnblocked).toHaveLength(0);
  });

  it("unblocks chain dependency when all pass", () => {
    const spec = validSpec({
      items: [
        { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
        { id: "b", title: "B", verify: "cmd", needs_human: false, depends_on: ["a"] },
        { id: "c", title: "C", verify: "cmd", needs_human: false, depends_on: ["b"] },
      ],
    });
    const progress = makeProgress(spec);
    // "a" and "b" both pass
    const statuses = new Map([
      ["acceptance__test-poc__a", "done"],
      ["acceptance__test-poc__b", "done"],
    ]);

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    expect(result.progress.items["a"]).toBe("pass");
    expect(result.progress.items["b"]).toBe("pass"); // was blocked, now "b" done → pass
    expect(result.progress.items["c"]).toBe("pending"); // unblocked
    expect(result.newlyUnblocked).toHaveLength(1);
    expect(result.newlyUnblocked[0].id).toBe("c");
  });

  it("does not unblock items with empty depends_on (should not be blocked)", () => {
    const spec = validSpec({
      items: [
        { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
      ],
    });
    const progress = makeProgress(spec);
    // "a" starts as pending (empty deps), not blocked
    expect(progress.items["a"]).toBe("pending");

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: new Map(), spec, nowIso });

    // Should stay pending
    expect(result.progress.items["a"]).toBe("pending");
    expect(result.newlyUnblocked).toHaveLength(0);
  });

  // ── demo 就绪判定 ──────────────────────────────────────────────

  it("sets demo to ready when all items pass", () => {
    const spec = validSpec({
      items: [
        { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
        { id: "b", title: "B", verify: "cmd", needs_human: false, depends_on: [] },
      ],
    });
    const progress = makeProgress(spec);
    const statuses = new Map([
      ["acceptance__test-poc__a", "done"],
      ["acceptance__test-poc__b", "done"],
    ]);

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    expect(result.progress.demo).toBe("ready");
    expect(result.demoReady).toBe(true);
  });

  it("does NOT set demo to ready when some items are not pass", () => {
    const spec = validSpec({
      items: [
        { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
        { id: "b", title: "B", verify: "cmd", needs_human: false, depends_on: [] },
      ],
    });
    const progress = makeProgress(spec);
    const statuses = new Map([
      ["acceptance__test-poc__a", "done"],
    ]); // "b" still pending

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    expect(result.progress.demo).toBe("locked");
    expect(result.demoReady).toBe(false);
  });

  it("demo stays ready (does not regress) when already ready", () => {
    const spec = validSpec({
      items: [
        { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
      ],
    });
    const progress = makeProgress(spec, { demo: "ready" } as Partial<AcceptanceProgress>);
    // All items pass but demo is already ready
    const statuses = new Map([["acceptance__test-poc__a", "done"]]);

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    expect(result.progress.demo).toBe("ready");
    // demoReady should only be true on transition
    expect(result.demoReady).toBe(false);
  });

  it("checks human items (pass) count toward demo readiness", () => {
    const spec = validSpec({
      items: [
        { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
        humanItem({ id: "b", needs_human: true }),
      ],
    });
    const progress = makeProgress(spec);
    const statuses = new Map([
      ["acceptance__test-poc__a", "done"],
      ["acceptance__test-poc__b", "done"],
    ]);

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    expect(result.progress.items["a"]).toBe("pass");
    expect(result.progress.items["b"]).toBe("pass"); // human item done → pass
    expect(result.progress.demo).toBe("ready");
  });

  // ── updated_at / 不可变性 ───────────────────────────────────────

  it("updates updated_at to the provided nowIso", () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const statuses = new Map([["acceptance__test-poc__a", "done"]]);

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    expect(result.progress.updated_at).toBe(nowIso);
  });

  it("does not mutate the input progress", () => {
    const spec = validSpec({
      items: [machineItem({ id: "a" })],
    });
    const progress = makeProgress(spec);
    const originalItems = { ...progress.items };
    const statuses = new Map([["acceptance__test-poc__a", "done"]]);

    reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    // Original progress should be unchanged
    expect(progress.items).toEqual(originalItems);
    expect(progress.updated_at).not.toBe(nowIso);
  });

  // ── 混合场景 ───────────────────────────────────────────────────

  it("handles mixed states: some pass, some fail, some running", () => {
    const spec = validSpec({
      items: [
        { id: "a", title: "A", verify: "cmd", needs_human: false, depends_on: [] },
        { id: "b", title: "B", verify: "cmd", needs_human: false, depends_on: [] },
        { id: "c", title: "C", verify: "cmd", needs_human: false, depends_on: [] },
      ],
    });
    const progress = makeProgress(spec);
    const statuses = new Map([
      ["acceptance__test-poc__a", "done"],
      ["acceptance__test-poc__b", "failed"],
      ["acceptance__test-poc__c", "running"],
    ]);

    const result = reconcileAcceptanceProgress({ progress, taskStatuses: statuses, spec, nowIso });

    expect(result.progress.items["a"]).toBe("pass");
    expect(result.progress.items["b"]).toBe("fail");
    expect(result.progress.items["c"]).toBe("running");
    expect(result.changes).toHaveLength(3);
    expect(result.demoReady).toBe(false);
  });
});
