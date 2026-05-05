import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteTaskRepository } from "../src/infrastructure/persistence/sqlite/tasks.js";
import { nowIso } from "../src/infrastructure/clock/iso-clock.js";

describe("SqliteTaskRepository.hasActiveDuplicateDedupeKey", () => {
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

  function freshDb(): SqliteTaskRepository {
    dir = join(tmpdir(), `agent-farm-dedupe-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const dbFile = join(dir, "t.db");
    mkdirSync(dir, { recursive: true });
    return new SqliteTaskRepository(dbFile);
  }

  it("false when dedupe key empty", async () => {
    const repo = freshDb();
    await repo.save([]);
    expect(await repo.hasActiveDuplicateDedupeKey("  ", "x")).toBe(false);
  });

  it("detects another active row with same dedupe_key", async () => {
    const repo = freshDb();
    const t = nowIso();
    await repo.save([
      {
        task_id: "a",
        status: "running",
        dedupe_key: "dup",
        mode: "execute",
        prompt: "p",
        created_at: t,
        started_at: t,
      },
      {
        task_id: "b",
        status: "claimed",
        dedupe_key: "dup",
        mode: "execute",
        prompt: "p",
        created_at: t,
        claimed_at: t,
      },
    ]);
    expect(await repo.hasActiveDuplicateDedupeKey("dup", "b")).toBe(true);
    expect(await repo.hasActiveDuplicateDedupeKey("dup", "a")).toBe(true);
  });

  it("false when only self matches", async () => {
    const repo = freshDb();
    const t = nowIso();
    await repo.save([
      {
        task_id: "only",
        status: "running",
        dedupe_key: "k",
        mode: "execute",
        prompt: "p",
        created_at: t,
        started_at: t,
      },
    ]);
    expect(await repo.hasActiveDuplicateDedupeKey("k", "only")).toBe(false);
  });
});
