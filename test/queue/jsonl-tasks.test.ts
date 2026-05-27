import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { JsonlTaskRepository } from "../../src/infrastructure/persistence/jsonl/tasks.js";
import type { TaskRecord } from "../../src/domain/task.js";

describe("JsonlTaskRepository", () => {
  let taskFile = "";

  afterEach(() => {
    if (taskFile && existsSync(taskFile)) {
      try { unlinkSync(taskFile); } catch { /* ignore */ }
    }
  });

  function freshRepo(): JsonlTaskRepository {
    taskFile = join(tmpdir(), `agent-farm-jsonl-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
    return new JsonlTaskRepository(taskFile);
  }

  function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
    return {
      task_id: `task-${Math.random().toString(36).slice(2, 8)}`,
      status: "queued",
      topic: "general",
      mode: "execute",
      created_at: new Date().toISOString(),
      started_at: null,
      prompt: "test prompt",
      ...overrides,
    };
  }

  describe("insertTask + list + getById", () => {
    it("inserts a task and retrieves it", async () => {
      const repo = freshRepo();
      const t = task({ task_id: "t1", prompt: "hello" });
      await repo.insertTask(t);

      const list = await repo.list();
      expect(list).toHaveLength(1);
      expect(list[0]!.task_id).toBe("t1");

      const got = await repo.getById("t1");
      expect(got).not.toBeNull();
      expect(got!.prompt).toBe("hello");
    });

    it("normalizes missing fields", async () => {
      const repo = freshRepo();
      const t = task({ task_id: "t1" });
      await repo.insertTask(t);
      const list = await repo.list();
      expect(list[0]!.status).toBe("queued");
      expect(list[0]!.mode).toBe("execute");
    });
  });

  describe("mergeOneTask", () => {
    it("merges a field on the task", async () => {
      const repo = freshRepo();
      const t = task({ task_id: "t1", status: "queued" });
      await repo.insertTask(t);

      const ok = await repo.mergeOneTask("t1", (row) => ({ ...row, status: "running" }));
      expect(ok).toBe(true);

      const got = await repo.getById("t1");
      expect(got!.status).toBe("running");
    });

    it("returns false when task not found", async () => {
      const repo = freshRepo();
      const ok = await repo.mergeOneTask("nonexistent", (row) => ({ ...row, status: "done" }));
      expect(ok).toBe(false);
    });

    it("returns false when mutator returns null", async () => {
      const repo = freshRepo();
      await repo.insertTask(task({ task_id: "t1" }));
      const ok = await repo.mergeOneTask("t1", () => null);
      expect(ok).toBe(false);
    });
  });

  describe("claimTasks", () => {
    it("claims up to limit queued tasks", async () => {
      const repo = freshRepo();
      await repo.save([
        task({ task_id: "t1", status: "queued" }),
        task({ task_id: "t2", status: "queued" }),
        task({ task_id: "t3", status: "done" }),
      ]);

      const claimed = await repo.claimTasks(2, "worker-1", new Date().toISOString());
      expect(claimed).toHaveLength(2);
      expect(claimed[0]!.status).toBe("claimed");
      expect(claimed[0]!.claimed_by).toBe("worker-1");

      const list = await repo.list();
      const claimedInDb = list.filter((r) => r.status === "claimed");
      expect(claimedInDb).toHaveLength(2);
    });

    it("claims fewer than limit when not enough queued tasks", async () => {
      const repo = freshRepo();
      await repo.save([
        task({ task_id: "t1", status: "queued" }),
        task({ task_id: "t2", status: "done" }),
      ]);

      const claimed = await repo.claimTasks(5, "worker-1", new Date().toISOString());
      expect(claimed).toHaveLength(1);
    });

    it("returns empty array when no queued tasks", async () => {
      const repo = freshRepo();
      await repo.save([task({ task_id: "t1", status: "done" })]);
      const claimed = await repo.claimTasks(5, "worker-1", new Date().toISOString());
      expect(claimed).toHaveLength(0);
    });
  });

  describe("hasActiveDuplicateDedupeKey", () => {
    it("returns true when duplicate with active status exists", async () => {
      const repo = freshRepo();
      await repo.save([
        task({ task_id: "t1", dedupe_key: "key-1", status: "queued" }),
        task({ task_id: "t2", dedupe_key: "key-1", status: "queued" }),
      ]);
      expect(await repo.hasActiveDuplicateDedupeKey("key-1", "t2")).toBe(true);
    });

    it("returns false when duplicate is not active", async () => {
      const repo = freshRepo();
      await repo.save([
        task({ task_id: "t1", dedupe_key: "key-1", status: "done" }),
      ]);
      expect(await repo.hasActiveDuplicateDedupeKey("key-1", "t2")).toBe(false);
    });

    it("returns false for empty dedupe key", async () => {
      const repo = freshRepo();
      expect(await repo.hasActiveDuplicateDedupeKey("", "t1")).toBe(false);
    });
  });

  describe("save", () => {
    it("replaces all rows on save", async () => {
      const repo = freshRepo();
      await repo.save([task({ task_id: "t1" }), task({ task_id: "t2" })]);
      expect((await repo.list())).toHaveLength(2);

      await repo.save([task({ task_id: "t3" })]);
      expect((await repo.list())).toHaveLength(1);
    });
  });

  describe("runInTransaction", () => {
    it("executes the function and returns its result", async () => {
      const repo = freshRepo();
      const result = await repo.runInTransaction(async () => 42);
      expect(result).toBe(42);
    });
  });
});
