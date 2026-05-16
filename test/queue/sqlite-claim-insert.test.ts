import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteTaskRepository } from "../../src/infrastructure/persistence/sqlite/tasks.js";
import { AddTaskUseCase } from "../../src/application/use-cases/task/add-task.js";
import { ClaimTasksUseCase } from "../../src/application/use-cases/task/claim-tasks.js";
import { systemIsoClock } from "../../src/infrastructure/clock/iso-clock.js";

describe("SqliteTaskRepository claimTasks / insertTask", () => {
  let dir = "";

  afterEach(() => {
    if (!dir) return;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    dir = "";
  });

  function freshRepo(): SqliteTaskRepository {
    dir = join(tmpdir(), `agent-farm-sqlite-${process.pid}-${Date.now()}`);
    const dbFile = join(dir, "t.db");
    mkdirSync(dir, { recursive: true });
    return new SqliteTaskRepository(dbFile);
  }

  it("insertTask + claimTasks without full-table save", async () => {
    const repo = freshRepo();
    const clock = systemIsoClock;
    const add = new AddTaskUseCase(repo, clock);
    const claim = new ClaimTasksUseCase(repo, clock);

    await add.execute({
      task_id: "q1",
      dedupe_key: "d1",
      prompt: "p".repeat(50),
      mode: "execute",
      acceptance_criteria: "npm test",
    });
    const claimed = await claim.execute(1);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.status).toBe("claimed");
    expect(claimed[0]!.task_id).toBe("q1");

    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe("claimed");
  });

  it("recoverStaleTasks updates only stale rows", async () => {
    const repo = freshRepo();
    const clock = systemIsoClock;
    const old = new Date(Date.now() - 7200_000).toISOString();
    await repo.insertTask!({
      task_id: "stale-1",
      dedupe_key: "d-stale",
      status: "running",
      mode: "execute",
      topic: "t",
      prompt: "p".repeat(50),
      acceptance_criteria: "npm test",
      heartbeat_at: old,
      created_at: old,
      started_at: old,
    });
    const ids = await repo.recoverStaleTasks!(60, clock());
    expect(ids).toContain("stale-1");
    const row = await repo.getById("stale-1");
    expect(row?.status).toBe("retry");
  });

  it("quarantinePoisonTasks deletes poison rows from queue", async () => {
    const repo = freshRepo();
    const clock = systemIsoClock;
    await repo.insertTask!({
      task_id: "poison-1",
      dedupe_key: "d-p",
      status: "failed",
      mode: "execute",
      topic: "t",
      prompt: "p".repeat(50),
      acceptance_criteria: "npm test",
      attempt: 5,
      created_at: clock(),
    });
    const blocked = await repo.quarantinePoisonTasks!(3, clock());
    expect(blocked).toHaveLength(1);
    expect(blocked[0]!.task_id).toBe("poison-1");
    expect(await repo.getById("poison-1")).toBeNull();
  });
});
