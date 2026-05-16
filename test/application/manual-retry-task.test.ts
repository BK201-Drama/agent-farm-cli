import { describe, expect, it } from "vitest";
import { ManualRetryTaskUseCase } from "../../src/application/use-cases/task/manual-retry-task.js";
import type { TaskRecord } from "../../src/domain/task.js";
import type { TaskRepository } from "../../src/domain/ports/repositories.js";

function memRepo(initial: TaskRecord[]): { repo: TaskRepository; rows: () => TaskRecord[] } {
  let data = initial.map((r) => ({ ...r }));
  const repo: TaskRepository = {
    async list() {
      return data.map((r) => ({ ...r }));
    },
    async save(next: TaskRecord[]) {
      data = next.map((r) => ({ ...r }));
    },
    async mergeOneTask(taskId: string, mutator: (row: TaskRecord) => TaskRecord | null) {
      const idx = data.findIndex((x) => String(x.task_id) === taskId);
      if (idx < 0) return false;
      const next = mutator(data[idx]!);
      if (next === null) return false;
      data[idx] = next;
      return true;
    },
  };
  return { repo, rows: () => data.map((r) => ({ ...r })) };
}

describe("ManualRetryTaskUseCase", () => {
  const clock = () => "2026-05-16T00:00:00.000Z";

  it("moves failed task to retry and bumps attempt", async () => {
    const { repo, rows } = memRepo([
      {
        task_id: "t1",
        status: "failed",
        attempt: 1,
        dedupe_key: "k",
        prompt: "p",
      },
    ]);
    const uc = new ManualRetryTaskUseCase(repo, clock);
    const r = await uc.execute("t1");
    expect(r.ok).toBe(true);
    expect(rows()[0]!.status).toBe("retry");
    expect(Number(rows()[0]!.attempt)).toBe(2);
  });

  it("rejects blocked transition", async () => {
    const { repo } = memRepo([
      {
        task_id: "t2",
        status: "blocked",
        attempt: 3,
        dedupe_key: "k",
        prompt: "p",
      },
    ]);
    const uc = new ManualRetryTaskUseCase(repo, clock);
    const r = await uc.execute("t2");
    expect(r.ok).toBe(false);
  });
});
