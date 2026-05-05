import { describe, expect, it } from "vitest";
import { processClaimedTask } from "../src/application/worker/process-claimed-task.js";
import { QueueService } from "../src/application/facades/queue.js";
import type { TaskRecord } from "../src/domain/task.js";
import type { EventRecord } from "../src/domain/event.js";
import { ACTIVE_STATUSES, type TaskStatus } from "../src/domain/task.js";
import type { EventRepository, QuarantineRepository, TaskRepository } from "../src/domain/ports/repositories.js";
import type { ShellRunner } from "../src/domain/ports/shell-runner.js";

const TEST_ISO = "2024-01-01T00:00:00.000Z";

function makeHarness(initial: TaskRecord[]): {
  queueService: QueueService;
  eventRepo: EventRepository;
  events: EventRecord[];
  rowsRef: () => TaskRecord[];
} {
  let rows = initial.map((r) => ({ ...r }));
  const events: EventRecord[] = [];
  const taskRepo: TaskRepository = {
    async list() {
      return rows;
    },
    async save(next) {
      rows = next;
    },
    async hasActiveDuplicateDedupeKey(dedupeKey: string, excludeTaskId: string) {
      const key = dedupeKey.trim();
      if (!key) return false;
      return rows.some(
        (x) =>
          String(x.task_id ?? "") !== excludeTaskId &&
          ACTIVE_STATUSES.has(String(x.status ?? "") as TaskStatus) &&
          String(x.dedupe_key ?? "").trim() === key
      );
    },
  };
  const quarantineRepo: QuarantineRepository = {
    async list() {
      return [];
    },
    async append() {
      /* noop */
    },
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
  return { queueService, eventRepo, events, rowsRef: () => rows };
}

async function runOnce(
  task: TaskRecord,
  opts: Partial<{
    verifyCommandTemplate: string;
    aiReviewCommandTemplate: string;
    requireAiReview: boolean;
    autoApproveReview: boolean;
    runShell: ShellRunner;
  }> & { rows?: TaskRecord[] }
) {
  const rows = opts.rows ?? [task];
  const { queueService, eventRepo, ...rest } = makeHarness(rows);
  await processClaimedTask({
    task,
    workspaceDir: "/ws",
    runsDir: "/runs",
    commandTemplate: "true",
    verifyCommandTemplate: opts.verifyCommandTemplate ?? "",
    aiReviewCommandTemplate: opts.aiReviewCommandTemplate ?? "",
    requireAiReview: opts.requireAiReview ?? false,
    autoApproveReview: opts.autoApproveReview ?? false,
    taskCommands: queueService,
    eventRepo,
    runShell:
      opts.runShell ??
      (async () => {
        return { exitCode: 0, output: "ok" };
      }),
    clock: () => TEST_ISO,
  });
  return rest;
}

describe("processClaimedTask", () => {
  it("runs claimed -> done with stub shell and auto-approve", async () => {
    const task: TaskRecord = {
      task_id: "t1",
      status: "claimed",
      prompt: "do it",
      dedupe_key: "d1",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
    };
    const { events, rowsRef } = await runOnce(task, { autoApproveReview: true });
    const row = rowsRef().find((r) => r.task_id === "t1");
    expect(row?.status).toBe("done");
    expect(events.some((e) => e.event === "task_running")).toBe(true);
    expect(events.some((e) => e.event === "task_done")).toBe(true);
  });

  it("retry on execute failure", async () => {
    const task: TaskRecord = {
      task_id: "t2",
      status: "claimed",
      prompt: "p",
      dedupe_key: "d2",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
    };
    let n = 0;
    const { events, rowsRef } = await runOnce(task, {
      runShell: async () => {
        n++;
        return { exitCode: 1, output: "boom" };
      },
    });
    expect(n).toBe(1);
    const row = rowsRef().find((r) => r.task_id === "t2");
    expect(row?.status).toBe("retry");
    expect(row?.attempt).toBe(1);
    expect(events.filter((e) => e.event === "task_failed" && e.stage === "execute").length).toBe(1);
  });

  it("blocks duplicate dedupe before running", async () => {
    const t1: TaskRecord = {
      task_id: "a",
      status: "running",
      dedupe_key: "dup",
      mode: "execute",
      attempt: 0,
    };
    const t2: TaskRecord = {
      task_id: "b",
      status: "claimed",
      dedupe_key: "dup",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
    };
    const { events, rowsRef } = await runOnce(t2, { rows: [t1, t2] });
    const row = rowsRef().find((r) => r.task_id === "b");
    expect(row?.status).toBe("blocked");
    expect(events.some((e) => e.event === "task_deduped_blocked")).toBe(true);
    expect(events.some((e) => e.event === "task_running")).toBe(false);
  });

  it("blocks when require-ai-review but no template", async () => {
    const task: TaskRecord = {
      task_id: "t3",
      status: "claimed",
      prompt: "p",
      dedupe_key: "d3",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
    };
    const { events, rowsRef } = await runOnce(task, { requireAiReview: true });
    const row = rowsRef().find((r) => r.task_id === "t3");
    expect(row?.status).toBe("blocked");
    expect(events.some((e) => e.event === "task_blocked")).toBe(true);
  });

  it("appends [ai-review-fix] on ai-review failure", async () => {
    const task: TaskRecord = {
      task_id: "t4",
      status: "claimed",
      prompt: "base",
      dedupe_key: "d4",
      mode: "execute",
      attempt: 0,
      claimed_at: TEST_ISO,
    };
    let calls = 0;
    const { rowsRef } = await runOnce(task, {
      aiReviewCommandTemplate: "true",
      runShell: async () => {
        calls++;
        if (calls === 1) return { exitCode: 0, output: "exec ok" };
        return { exitCode: 1, output: "judge says no" };
      },
    });
    const row = rowsRef().find((r) => r.task_id === "t4");
    expect(row?.status).toBe("retry");
    expect(String(row?.prompt ?? "")).toContain("[ai-review-fix]");
    expect(String(row?.prompt ?? "")).toContain("judge says no");
  });
});
