import { describe, expect, it } from "vitest";
import { RecoverStaleUseCase } from "../../src/application/use-cases/task/recover-stale.js";
import type { TaskRepository } from "../../src/domain/ports/repositories.js";
import type { TaskRecord } from "../../src/domain/task.js";

const clock = () => "2026-05-28T00:00:00.000Z";

function fakeTaskRepo(rows: TaskRecord[]): TaskRepository {
  return {
    list: async () => rows,
    save: async () => {},
    hasActiveDuplicateDedupeKey: async () => false,
    getById: async (id) => rows.find((r) => r.task_id === id) ?? null,
  };
}

describe("RecoverStaleUseCase", () => {
  it("returns recovered task_ids when stale running tasks exist", async () => {
    const repo = fakeTaskRepo([
      {
        task_id: "t1",
        status: "running",
        started_at: "2026-05-28T00:00:00.000Z",
        heartbeat_at: "2026-01-01T00:00:00.000Z",
        attempt: 0,
        created_at: "2026-05-28T00:00:00.000Z",
        topic: "general",
        mode: "execute",
        started_at_null: null,
      },
      {
        task_id: "t2",
        status: "queued",
        attempt: 0,
        created_at: "2026-05-28T00:00:00.000Z",
        topic: "general",
        mode: "execute",
        started_at_null: null,
      },
    ]);
    const useCase = new RecoverStaleUseCase(repo, clock);
    const result = await useCase.execute(1800);
    expect(result.ok).toBe(true);
    expect(result.recovered_count).toBe(1);
    expect(result.task_ids).toEqual(["t1"]);
  });

  it("returns empty when no stale tasks", async () => {
    const repo = fakeTaskRepo([
      {
        task_id: "t1",
        status: "running",
        started_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
        attempt: 0,
        created_at: "2026-05-28T00:00:00.000Z",
        topic: "general",
        mode: "execute",
        started_at_null: null,
      },
    ]);
    const useCase = new RecoverStaleUseCase(repo, clock);
    const result = await useCase.execute(1800);
    expect(result.recovered_count).toBe(0);
    expect(result.task_ids).toEqual([]);
  });

  it("uses direct recoverStaleTasks when repo supports it", async () => {
    let directCalled = false;
    const repo: TaskRepository = {
      list: async () => [],
      save: async () => {},
      hasActiveDuplicateDedupeKey: async () => false,
      getById: async () => null,
      recoverStaleTasks: async () => {
        directCalled = true;
        return ["direct-t1"];
      },
    };
    const useCase = new RecoverStaleUseCase(repo, clock);
    const result = await useCase.execute(1800);
    expect(directCalled).toBe(true);
    expect(result.task_ids).toEqual(["direct-t1"]);
  });
});
