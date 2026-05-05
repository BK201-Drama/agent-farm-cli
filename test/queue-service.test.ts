import { describe, expect, it } from "vitest";
import { QueueService } from "../src/application/facades/queue.js";
import type { TaskRecord } from "../src/domain/task.js";
import type { QuarantineRepository, TaskRepository } from "../src/domain/ports/repositories.js";
import { ACTIVE_STATUSES, type TaskStatus } from "../src/domain/task.js";

const CLOCK = () => "2024-06-01T12:00:00.000Z";

function makeRepos(initial: TaskRecord[]): {
  taskRepo: TaskRepository;
  quarantineRepo: QuarantineRepository;
  rowsRef: () => TaskRecord[];
  quarantineRef: () => TaskRecord[];
} {
  let rows = initial.map((r) => ({ ...r }));
  let quarantine: TaskRecord[] = [];
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
      return quarantine;
    },
    async append(next) {
      quarantine = quarantine.concat(next);
    },
  };
  return {
    taskRepo,
    quarantineRepo,
    rowsRef: () => rows,
    quarantineRef: () => quarantine,
  };
}

describe("QueueService (application facade over use cases)", () => {
  it("addTask normalizes and saves", async () => {
    const { taskRepo, quarantineRepo, rowsRef } = makeRepos([]);
    const svc = new QueueService(taskRepo, quarantineRepo, CLOCK);
    const row = await svc.addTask({ task_id: "t1", prompt: "hi", dedupe_key: "d1" });
    expect(row.task_id).toBe("t1");
    expect(rowsRef()).toHaveLength(1);
  });

  it("addTask rejects duplicate dedupe in active queue", async () => {
    const { taskRepo, quarantineRepo } = makeRepos([
      { task_id: "a", status: "running", dedupe_key: "dup", prompt: "x" },
    ]);
    const svc = new QueueService(taskRepo, quarantineRepo, CLOCK);
    await expect(svc.addTask({ task_id: "b", prompt: "y", dedupe_key: "dup" })).rejects.toThrow(/duplicate dedupe_key/);
  });

  it("claimTasks", async () => {
    const { taskRepo, quarantineRepo, rowsRef } = makeRepos([
      { task_id: "1", status: "queued", prompt: "a" },
      { task_id: "2", status: "retry", prompt: "b" },
    ]);
    const svc = new QueueService(taskRepo, quarantineRepo, CLOCK);
    const claimed = await svc.claimTasks(2);
    expect(claimed).toHaveLength(2);
    expect(rowsRef().every((r) => r.status === "claimed")).toBe(true);
    expect(String(rowsRef()[0]?.claimed_by ?? "")).toMatch(/#/);
  });

  it("batchCancel moves queued and running to cancelled", async () => {
    const { taskRepo, quarantineRepo, rowsRef } = makeRepos([
      { task_id: "q1", status: "queued", prompt: "p" },
      { task_id: "r1", status: "running", prompt: "p" },
    ]);
    const svc = new QueueService(taskRepo, quarantineRepo, CLOCK);
    const out = await svc.batchCancel(["queued", "running"], "admin");
    expect(out.cancelled_count).toBe(2);
    expect(rowsRef().every((r) => r.status === "cancelled")).toBe(true);
  });

  it("updateStatus illegal transition throws", async () => {
    const { taskRepo, quarantineRepo } = makeRepos([{ task_id: "x", status: "done", prompt: "p" }]);
    const svc = new QueueService(taskRepo, quarantineRepo, CLOCK);
    await expect(svc.updateStatus("x", "running")).rejects.toThrow(/illegal transition/);
  });

  it("recoverStale", async () => {
    const old = new Date(Date.now() - 4000 * 1000).toISOString();
    const { taskRepo, quarantineRepo, rowsRef } = makeRepos([
      { task_id: "r", status: "running", heartbeat_at: old, attempt: 0, prompt: "p" },
    ]);
    const svc = new QueueService(taskRepo, quarantineRepo, CLOCK);
    const out = await svc.recoverStale(1800);
    expect(out.recovered_count).toBe(1);
    expect(rowsRef()[0]?.status).toBe("retry");
  });

  it("quarantinePoison", async () => {
    const { taskRepo, quarantineRepo, rowsRef, quarantineRef } = makeRepos([
      { task_id: "bad", status: "retry", attempt: 9, prompt: "p" },
    ]);
    const svc = new QueueService(taskRepo, quarantineRepo, CLOCK);
    const out = await svc.quarantinePoison(3);
    expect(out.quarantined_count).toBe(1);
    expect(rowsRef()).toHaveLength(0);
    expect(quarantineRef()).toHaveLength(1);
  });

  it("reviewApprove from review", async () => {
    const { taskRepo, quarantineRepo, rowsRef } = makeRepos([
      { task_id: "rv", status: "review", prompt: "p", mode: "execute" },
    ]);
    const svc = new QueueService(taskRepo, quarantineRepo, CLOCK);
    await svc.reviewApprove("rv", "mgr", "ok", false);
    expect(rowsRef()[0]?.status).toBe("done");
  });
});
