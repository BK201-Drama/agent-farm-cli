import { describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  ensureParentDirForDbFile,
  resolveOpencodeDbPathForTask,
} from "../src/application/worker/opencode-db-path.js";

describe("opencode-db-path", () => {
  it("resolveOpencodeDbPathForTask nests under .agent-farm/opencode-db and sanitizes task id", () => {
    const root = join(tmpdir(), "af-opencode-test-root");
    const p = resolveOpencodeDbPathForTask(root, "task/a|b");
    expect(p).toMatch(/[/\\]\.agent-farm[/\\]opencode-db[/\\]task_a_b\.db$/);
    expect(p).toContain(".agent-farm");
    expect(p).toContain("opencode-db");
  });

  it("ensureParentDirForDbFile creates parent directory", () => {
    const root = join(tmpdir(), `af-opencode-mkdir-${Date.now()}`);
    const db = join(root, "nested", "opencode-db", "x.db");
    try {
      ensureParentDirForDbFile(db);
      expect(existsSync(dirname(db))).toBe(true);
    } finally {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
});
