import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { InsightsService } from "../../src/application/facades/insights.js";
import { noopGitWorkspacePort } from "../../src/application/contracts/noop-ports.js";
import type { EventRecord } from "../../src/domain/event.js";
import type { TaskRecord } from "../../src/domain/task.js";
import type { EventRepository, TaskRepository } from "../../src/domain/ports/repositories.js";

describe("InsightsService", () => {
  it("build aggregates status and duration", async () => {
    const tasks: TaskRecord[] = [
      { task_id: "a", status: "done", prompt: "x" },
      { task_id: "b", status: "failed", last_error: "boom", prompt: "y" },
    ];
    const events: EventRecord[] = [
      { ts: "2024-01-01T00:00:00.000Z", event: "task_running", task_id: "a" },
      { ts: "2024-01-01T00:00:10.000Z", event: "task_done", task_id: "a" },
    ];
    const taskRepo: TaskRepository = {
      async list() {
        return tasks;
      },
      async save() {
        /* noop */
      },
      async hasActiveDuplicateDedupeKey() {
        return false;
      },
    };
    const eventRepo: EventRepository = {
      async list() {
        return events;
      },
      async append() {
        /* noop */
      },
    };
    const svc = new InsightsService(taskRepo, eventRepo, noopGitWorkspacePort);
    const report = await svc.build(5);
    expect(report.tasks_total).toBe(2);
    expect(report.events_total).toBe(2);
    expect((report.status_counts as Record<string, number>).done).toBe(1);
    expect((report.duration_summary as { count: number }).count).toBe(1);
  });

  it("buildBoardSnapshot partitions pipeline and history", async () => {
    const tasks: TaskRecord[] = [
      { task_id: "p", status: "queued", prompt: "x" },
      { task_id: "h", status: "done", prompt: "y" },
    ];
    const taskRepo: TaskRepository = {
      async list() {
        return tasks;
      },
      async save() {
        /* noop */
      },
      async hasActiveDuplicateDedupeKey() {
        return false;
      },
    };
    const eventRepo: EventRepository = {
      async list() {
        return [];
      },
      async append() {
        /* noop */
      },
    };
    const svc = new InsightsService(taskRepo, eventRepo, noopGitWorkspacePort);
    const snap = await svc.buildBoardSnapshot();
    expect(snap.tasks_total).toBe(2);
    expect((snap.pipeline as TaskRecord[]).map((t) => t.task_id)).toEqual(["p"]);
    expect((snap.history as TaskRecord[]).map((t) => t.task_id)).toEqual(["h"]);
  });

  it("listRecentEvents returns tail", async () => {
    const events: EventRecord[] = [
      { ts: "1", event: "a", task_id: "x" },
      { ts: "2", event: "b", task_id: "y" },
      { ts: "3", event: "c", task_id: "z" },
    ];
    const taskRepo: TaskRepository = {
      async list() {
        return [];
      },
      async save() {
        /* noop */
      },
      async hasActiveDuplicateDedupeKey() {
        return false;
      },
    };
    const eventRepo: EventRepository = {
      async list() {
        return events;
      },
      async append() {
        /* noop */
      },
    };
    const svc = new InsightsService(taskRepo, eventRepo, noopGitWorkspacePort);
    const tail = await svc.listRecentEvents(2);
    expect(tail.map((e) => e.event)).toEqual(["b", "c"]);
  });

  it("output includes resource_leak with git_locks and orphan_worktrees when gitTop provided", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "af-insights-leak-"));
    const gitDir = join(tmp, ".git");
    mkdirSync(gitDir, { recursive: true });
    try {
      const tasks: TaskRecord[] = [{ task_id: "t1", status: "queued", prompt: "x" }];
      const events: EventRecord[] = [];
      const taskRepo: TaskRepository = {
        async list() {
          return tasks;
        },
        async save() {
          /* noop */
        },
        async hasActiveDuplicateDedupeKey() {
          return false;
        },
      };
      const eventRepo: EventRepository = {
        async list() {
          return events;
        },
        async append() {
          /* noop */
        },
      };
      const svc = new InsightsService(taskRepo, eventRepo, noopGitWorkspacePort);
      const r = await svc.build(5, tmp);
      expect(r.resource_leak).toBeDefined();
      expect((r.resource_leak as { git_locks: unknown[] }).git_locks).toEqual([]);
      expect((r.resource_leak as { orphan_worktrees: unknown[] }).orphan_worktrees).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
