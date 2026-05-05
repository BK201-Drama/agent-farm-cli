import { describe, expect, it } from "vitest";
import { DoctorService } from "../src/application/services/doctor-service.js";
import type { TaskRecord } from "../src/domain/task.js";
import type { QuarantineRepository, TaskRepository } from "../src/domain/ports/repositories.js";

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
});
