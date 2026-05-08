import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const wavePath = join(repoRoot, "examples/agent-farm-waves/worktree-parallel-smoke.json");

describe("examples/agent-farm-waves/worktree-parallel-smoke.json", () => {
  it("is a non-empty array of execute tasks with distinct task_id/dedupe_key", () => {
    const raw = readFileSync(wavePath, "utf8");
    const arr = JSON.parse(raw) as unknown[];
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBeGreaterThanOrEqual(2);
    const ids = new Set<string>();
    for (const t of arr) {
      expect(t && typeof t === "object").toBe(true);
      const o = t as Record<string, unknown>;
      expect(String(o.mode ?? "")).toBe("execute");
      const id = String(o.task_id ?? "").trim();
      expect(id.length).toBeGreaterThan(0);
      expect(ids.has(id)).toBe(false);
      ids.add(id);
      expect(String(o.dedupe_key ?? "").trim()).toBe(id);
      expect(String(o.prompt ?? "").trim().length).toBeGreaterThan(0);
    }
  });
});
