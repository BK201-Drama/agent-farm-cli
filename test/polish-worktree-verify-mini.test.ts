import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const wavePath = join(repoRoot, "examples/agent-farm-waves/polish-worktree-verify-mini.json");

describe("examples/agent-farm-waves/polish-worktree-verify-mini.json", () => {
  it("has exactly two execute tasks targeting disjoint paths", () => {
    const arr = JSON.parse(readFileSync(wavePath, "utf8")) as unknown[];
    expect(arr).toHaveLength(2);
    const paths: string[] = [];
    for (const t of arr) {
      const o = t as Record<string, unknown>;
      expect(String(o.mode ?? "")).toBe("execute");
      const id = String(o.task_id ?? "").trim();
      expect(id.length).toBeGreaterThan(0);
      expect(String(o.dedupe_key ?? "").trim()).toBe(id);
      const m = String(o.prompt ?? "").match(/只改文件\s+(\S+)/);
      expect(m).toBeTruthy();
      paths.push(m![1]!);
    }
    expect(new Set(paths).size).toBe(2);
    expect(paths.some((p) => p.includes("SKILL.md"))).toBe(true);
    expect(paths.some((p) => p.includes("agent-farm-dispatch-batch.mjs"))).toBe(true);
  });
});
