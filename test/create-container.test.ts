import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createContainer } from "../src/bootstrap/container.js";

describe("createContainer (composition root)", () => {
  let dir = "";

  afterEach(() => {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    dir = "";
  });

  it("wires sqlite queueService", async () => {
    dir = join(tmpdir(), `farm-ct-${process.pid}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const db = join(dir, "q.db");
    const c = createContainer({
      storage: "sqlite",
      dbFile: db,
      taskFile: join(dir, "tasks.jsonl"),
      eventFile: join(dir, "events.jsonl"),
      quarantineFile: join(dir, "q.jsonl"),
    });
    const row = await c.queueService.addTask({
      task_id: "c1",
      prompt: "p",
      dedupe_key: "d",
    });
    expect(row.task_id).toBe("c1");
    const list = await c.queueService.listTasks();
    expect(list.length).toBeGreaterThanOrEqual(1);
  });
});
