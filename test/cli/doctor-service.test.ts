import { describe, expect, it } from "vitest";
import { DoctorService } from "../../src/application/facades/doctor.js";
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
    const svc = new DoctorService(taskRepo, quarantineRepo);
    const r = await svc.build(1800, 2, 5);
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
    const svc = new DoctorService(taskRepo, quarantineRepo, eventRepo);
    const r = await svc.build(1800, 2, 5);
    expect(r.tasks_with_opencode_heal_prompt).toBe(1);
    expect(r.opencode_stream_diag_recent_count).toBe(2);
    expect((r.opencode_stream_diag_by_stage as Record<string, number>).execute).toBe(1);
    expect((r.opencode_stream_diag_by_stage as Record<string, number>).verify).toBe(1);
  });
});
