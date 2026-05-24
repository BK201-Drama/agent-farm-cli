import { describe, expect, it } from "vitest";
import { runWorkerLoop, type WorkerOptions } from "../../src/application/facades/worker.js";
import { QueueService } from "../../src/application/facades/queue.js";
import type { EventRecord } from "../../src/domain/event.js";
import type { EventRepository, QuarantineRepository, TaskRepository } from "../../src/domain/ports/repositories.js";
import type { ShellRunner } from "../../src/domain/ports/shell-runner.js";
import type { ContainerPorts } from "../../src/application/contracts/container-ports.js";

const TEST_ISO = "2024-01-01T00:00:00.000Z";

function noopShell(): ShellRunner {
  return async (_cmd, _opts) => ({ exitCode: 0, stdout: "", stderr: "", timedOut: false });
}

function noopPorts(): ContainerPorts {
  return {
    projectConfig: { load: () => null },
    gitWorkspace: {
      resolveGitTopLevel: () => null,
      sanitizeTaskIdForPath: (id) => id.replace(/[^a-zA-Z0-9._-]+/g, "_"),
      findOrphanWorktrees: () => [],
      createAgentFarmWorktree: () => {
        throw new Error("worktree not used in unit test");
      },
      commitWorktreeSnapshot: () => ({ dirty: false, ok: true, committed: false, stdoutStderr: "" }),
      mergeAgentFarmBranchSerialized: async () => ({ ok: true, combined: "" }),
    },
  };
}

interface Harness {
  queueService: QueueService;
  events: EventRecord[];
  eventRepo: EventRepository;
  /** mutable counter — read after runWorkerLoop to check call count */
  recoverStaleCalls: { count: number };
}

function makeHarness(opts?: { recoverStaleTaskIds?: string[] }): Harness {
  const events: EventRecord[] = [];
  const recoverStaleCalls = { count: 0 };
  const recoveredIds = opts?.recoverStaleTaskIds ?? [];

  const taskRepo: TaskRepository = {
    async list() {
      return [];
    },
    async save() {},
    async hasActiveDuplicateDedupeKey() {
      return false;
    },
    async getById() {
      return null;
    },
    async runInTransaction(fn) {
      return fn();
    },
    async recoverStaleTasks(_leaseTimeoutSeconds, _nowIso) {
      recoverStaleCalls.count++;
      return recoveredIds;
    },
    async claimTasks(_limit, _claimant, _claimedAtIso) {
      return [];
    },
  };

  const quarantineRepo: QuarantineRepository = {
    async list() {
      return [];
    },
    async append() {},
  };

  const queueService = new QueueService(taskRepo, quarantineRepo, () => TEST_ISO);

  const eventRepo: EventRepository = {
    async list() {
      return events;
    },
    async append(e) {
      events.push(e);
    },
  };

  return { queueService, events, eventRepo, recoverStaleCalls };
}

function buildWorkerOpts(harness: Harness, overrides: Partial<WorkerOptions> = {}): WorkerOptions {
  return {
    queueService: harness.queueService,
    eventRepo: harness.eventRepo,
    runsDir: "/tmp/test-runs",
    workspaceDir: "/tmp/test-workspace",
    workers: 1,
    loopSleepMs: 0,
    commandTemplate: "echo test",
    leaseTimeoutSeconds: 600,
    poisonMaxAttempts: 3,
    autoApproveReview: true,
    drainIdleLoops: 1,
    runShell: noopShell(),
    clock: () => TEST_ISO,
    ports: noopPorts(),
    ...overrides,
  };
}

describe("worker auto-recovery", () => {
  it("calls recoverStale on tick and writes task_auto_recovered events", async () => {
    const harness = makeHarness({ recoverStaleTaskIds: ["task-stale-1", "task-stale-2"] });
    const opts = buildWorkerOpts(harness, { autoRecovery: true });

    await runWorkerLoop(opts);

    expect(harness.recoverStaleCalls.count).toBeGreaterThanOrEqual(1);
    const recoveredEvents = harness.events.filter((e) => e.event === "task_auto_recovered");
    expect(recoveredEvents).toHaveLength(2);
    expect(recoveredEvents.map((e) => e.task_id).sort()).toEqual(["task-stale-1", "task-stale-2"]);
  });

  it("skips recoverStale when autoRecovery is false", async () => {
    const harness = makeHarness({ recoverStaleTaskIds: ["task-stale-1"] });
    const opts = buildWorkerOpts(harness, { autoRecovery: false });

    await runWorkerLoop(opts);

    expect(harness.recoverStaleCalls.count).toBe(0);
    const recoveredEvents = harness.events.filter((e) => e.event === "task_auto_recovered");
    expect(recoveredEvents).toHaveLength(0);
  });

  it("writes no events when nothing is stale", async () => {
    const harness = makeHarness({ recoverStaleTaskIds: [] });
    const opts = buildWorkerOpts(harness);

    await runWorkerLoop(opts);

    const recoveredEvents = harness.events.filter((e) => e.event === "task_auto_recovered");
    expect(recoveredEvents).toHaveLength(0);
  });

  it("autoRecovery defaults to true when omitted", async () => {
    const harness = makeHarness({ recoverStaleTaskIds: ["task-1"] });
    const opts = buildWorkerOpts(harness);
    // autoRecovery not set → should default to true
    expect(opts.autoRecovery).toBeUndefined();

    await runWorkerLoop(opts);

    expect(harness.recoverStaleCalls.count).toBeGreaterThanOrEqual(1);
  });
});
