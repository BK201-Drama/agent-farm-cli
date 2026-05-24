import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DoctorService } from "../../src/application/facades/doctor.js";
import { noopGitWorkspacePort } from "../../src/application/contracts/noop-ports.js";
import type { TaskRecord } from "../../src/domain/task.js";
import type { EventRepository, QuarantineRepository, TaskRepository } from "../../src/domain/ports/repositories.js";

describe("DoctorService", () => {
  it("build flags duplicate dedupe keys among active tasks", async () => {
    const tasks: TaskRecord[] = [
      { task_id: "1", status: "queued", dedupe_key: "k" },
      { task_id: "2", status: "running", dedupe_key: "k" },
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
    const quarantineRepo: QuarantineRepository = {
      async list() {
        return [];
      },
      async append() {
        /* noop */
      },
    };
    const svc = new DoctorService(taskRepo, quarantineRepo, noopGitWorkspacePort);
    const r = await svc.build(1800, 2, 5, null);
    expect(r.duplicate_dedupe_keys_count).toBe(1);
    expect((r.duplicate_dedupe_keys as { dedupe_key: string }[])[0]?.dedupe_key).toBe("k");
  });

  it("counts opencode heal prompts and stream diag events when event repo provided", async () => {
    const tasks: TaskRecord[] = [
      { task_id: "a", status: "retry", prompt: "x\n\n[opencode-heal]\n{}" },
      { task_id: "b", status: "queued", prompt: "clean" },
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
    const quarantineRepo: QuarantineRepository = {
      async list() {
        return [];
      },
      async append() {
        /* noop */
      },
    };
    const eventRepo: EventRepository = {
      async list() {
        return [
          { event: "task_opencode_stream_diag", stage: "execute" },
          { event: "task_opencode_stream_diag", stage: "verify" },
        ];
      },
      async append() {
        /* noop */
      },
    };
    const svc = new DoctorService(taskRepo, quarantineRepo, noopGitWorkspacePort, eventRepo);
    const r = await svc.build(1800, 2, 5, null);
    expect(r.tasks_with_opencode_heal_prompt).toBe(1);
    expect(r.opencode_stream_diag_recent_count).toBe(2);
    expect((r.opencode_stream_diag_by_stage as Record<string, number>).execute).toBe(1);
    expect((r.opencode_stream_diag_by_stage as Record<string, number>).verify).toBe(1);
  });

  it("calculates stale_running with heartbeat_at filtering by leaseTimeoutSeconds", async () => {
    const now = Date.now();
    const tasks: TaskRecord[] = [
      { task_id: "1", status: "running", heartbeat_at: new Date(now - 3600_000).toISOString() },
      { task_id: "2", status: "running", heartbeat_at: new Date(now - 500_000).toISOString() },
      { task_id: "3", status: "queued" },
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
    const quarantineRepo: QuarantineRepository = {
      async list() {
        return [];
      },
      async append() {
        /* noop */
      },
    };
    const svc = new DoctorService(taskRepo, quarantineRepo, noopGitWorkspacePort);
    const r = await svc.build(1800, 2, 5, null);
    expect(r.stale_running_count).toBe(1);
    expect((r.stale_running as { task_id: string; age_seconds: number }[])[0].task_id).toBe("1");
    expect((r.stale_running as { task_id: string; age_seconds: number }[])[0].age_seconds).toBeGreaterThanOrEqual(3599);
  });

  it("calculates stale_running with started_at fallback when heartbeat_at absent", async () => {
    const now = Date.now();
    const tasks: TaskRecord[] = [
      { task_id: "1", status: "running", started_at: new Date(now - 3600_000).toISOString() },
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
    const quarantineRepo: QuarantineRepository = {
      async list() {
        return [];
      },
      async append() {
        /* noop */
      },
    };
    const svc = new DoctorService(taskRepo, quarantineRepo, noopGitWorkspacePort);
    const r = await svc.build(1800, 2, 5, null);
    expect(r.stale_running_count).toBe(1);
  });

  it("duplicate_dedupe_keys only considers ACTIVE_STATUSES", async () => {
    const tasks: TaskRecord[] = [
      { task_id: "1", status: "queued", dedupe_key: "k" },
      { task_id: "2", status: "done", dedupe_key: "k" },
      { task_id: "3", status: "failed", dedupe_key: "k" },
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
    const quarantineRepo: QuarantineRepository = {
      async list() {
        return [];
      },
      async append() {
        /* noop */
      },
    };
    const svc = new DoctorService(taskRepo, quarantineRepo, noopGitWorkspacePort);
    const r = await svc.build(1800, 2, 5, null);
    expect(r.duplicate_dedupe_keys_count).toBe(0);
  });

  it("calculates review_overdue with review_requested_at filtering by reviewOverdueHours", async () => {
    const now = Date.now();
    const tasks: TaskRecord[] = [
      { task_id: "1", status: "review", review_requested_at: new Date(now - 48 * 3600_000).toISOString() },
      { task_id: "2", status: "review", review_requested_at: new Date(now - 12 * 3600_000).toISOString() },
      { task_id: "3", status: "queued" },
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
    const quarantineRepo: QuarantineRepository = {
      async list() {
        return [];
      },
      async append() {
        /* noop */
      },
    };
    const svc = new DoctorService(taskRepo, quarantineRepo, noopGitWorkspacePort);
    const r = await svc.build(1800, 24, 5, null);
    expect(r.review_overdue_count).toBe(1);
    expect((r.review_overdue as { task_id: string; age_hours: number }[])[0].task_id).toBe("1");
    expect((r.review_overdue as { task_id: string; age_hours: number }[])[0].age_hours).toBeGreaterThanOrEqual(47);
  });

  it("calculates failure_hotspots sorted by count and limited by topN", async () => {
    const tasks: TaskRecord[] = [
      { task_id: "1", status: "failed", last_error: "timeout" },
      { task_id: "2", status: "failed", last_error: "timeout" },
      { task_id: "3", status: "failed", last_error: "network" },
      { task_id: "4", status: "blocked", blocked_reason: "memory" },
      { task_id: "5", status: "retry", last_error: "memory" },
      { task_id: "6", status: "queued" },
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
    const quarantineRepo: QuarantineRepository = {
      async list() {
        return [];
      },
      async append() {
        /* noop */
      },
    };
    const svc = new DoctorService(taskRepo, quarantineRepo, noopGitWorkspacePort);
    const r = await svc.build(1800, 2, 2, null);
    const hotspots = r.failure_hotspots as { reason: string; count: number }[];
    expect(hotspots.length).toBe(2);
    expect(hotspots.map((h) => h.count).sort()).toEqual([2, 2]);
    expect(hotspots[0].count).toBe(2);
    expect(hotspots[1].count).toBe(2);
  });

  it("failure_hotspots uses 'unknown' when no error reason", async () => {
    const tasks: TaskRecord[] = [
      { task_id: "1", status: "failed" },
      { task_id: "2", status: "blocked" },
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
    const quarantineRepo: QuarantineRepository = {
      async list() {
        return [];
      },
      async append() {
        /* noop */
      },
    };
    const svc = new DoctorService(taskRepo, quarantineRepo, noopGitWorkspacePort);
    const r = await svc.build(1800, 2, 5, null);
    const hotspots = r.failure_hotspots as { reason: string; count: number }[];
    expect(hotspots).toContainEqual({ reason: "unknown", count: 2 });
  });

  it("failure_hotspots truncates error reason to 160 chars", async () => {
    const tasks: TaskRecord[] = [{ task_id: "1", status: "failed", last_error: "x".repeat(200) }];
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
    const quarantineRepo: QuarantineRepository = {
      async list() {
        return [];
      },
      async append() {
        /* noop */
      },
    };
    const svc = new DoctorService(taskRepo, quarantineRepo, noopGitWorkspacePort);
    const r = await svc.build(1800, 2, 5, null);
    const hotspots = r.failure_hotspots as { reason: string; count: number }[];
    expect(hotspots[0].reason.length).toBe(160);
  });

  it("tasksWithOpencodeHealPrompt counts tasks with [opencode-heal] in prompt", async () => {
    const tasks: TaskRecord[] = [
      { task_id: "1", prompt: "normal prompt" },
      { task_id: "2", prompt: "x\n\n[opencode-heal]\n{}" },
      { task_id: "3", prompt: "[opencode-heal] at start" },
      { task_id: "4" },
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
    const quarantineRepo: QuarantineRepository = {
      async list() {
        return [];
      },
      async append() {
        /* noop */
      },
    };
    const svc = new DoctorService(taskRepo, quarantineRepo, noopGitWorkspacePort);
    const r = await svc.build(1800, 2, 5, null);
    expect(r.tasks_with_opencode_heal_prompt).toBe(2);
  });

  it("leaseTimeoutSeconds=0 marks all running tasks as stale", async () => {
    const now = Date.now();
    const tasks: TaskRecord[] = [{ task_id: "1", status: "running", heartbeat_at: new Date(now - 1000).toISOString() }];
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
    const quarantineRepo: QuarantineRepository = {
      async list() {
        return [];
      },
      async append() {
        /* noop */
      },
    };
    const svc = new DoctorService(taskRepo, quarantineRepo, noopGitWorkspacePort);
    const r = await svc.build(0, 2, 5, null);
    expect(r.stale_running_count).toBe(1);
  });

  it("reviewOverdueHours=0 marks all review tasks as overdue", async () => {
    const now = Date.now();
    const tasks: TaskRecord[] = [
      { task_id: "1", status: "review", review_requested_at: new Date(now - 1000).toISOString() },
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
    const quarantineRepo: QuarantineRepository = {
      async list() {
        return [];
      },
      async append() {
        /* noop */
      },
    };
    const svc = new DoctorService(taskRepo, quarantineRepo, noopGitWorkspacePort);
    const r = await svc.build(1800, 0, 5, null);
    expect(r.review_overdue_count).toBe(1);
  });

  it("output includes git_locks and orphan_worktrees fields from resource leak scan", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "af-doctor-leak-"));
    const gitDir = join(tmp, ".git");
    mkdirSync(gitDir, { recursive: true });
    try {
      const tasks: TaskRecord[] = [{ task_id: "t1", status: "queued" }];
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
      const quarantineRepo: QuarantineRepository = {
        async list() {
          return [];
        },
        async append() {
          /* noop */
        },
      };
      const svc = new DoctorService(taskRepo, quarantineRepo, noopGitWorkspacePort);
      const r = await svc.build(1800, 2, 5, tmp);
      expect(r.git_locks_count).toBe(0);
      expect(r.git_locks).toEqual([]);
      expect(r.orphan_worktrees_count).toBe(0);
      expect(r.orphan_worktrees).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
