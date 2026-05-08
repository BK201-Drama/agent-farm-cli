import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const wavePath = join(repoRoot, "test/fixtures/waves/opencode-parallel-verify.json");

describe("test/fixtures/waves/opencode-parallel-verify.json", () => {
  it("has two execute tasks with distinct ids and disjoint target files in prompts", () => {
    const arr = JSON.parse(readFileSync(wavePath, "utf8")) as unknown[];
    expect(arr).toHaveLength(2);
    const files = new Set<string>();
    for (const t of arr) {
      const o = t as Record<string, unknown>;
      expect(String(o.mode ?? "")).toBe("execute");
      const id = String(o.task_id ?? "").trim();
      expect(id.length).toBeGreaterThan(0);
      expect(String(o.dedupe_key ?? "").trim()).toBe(id);
      const p = String(o.prompt ?? "");
      const m = p.match(/只改文件\s+(\S+)/);
      expect(m, "prompt should say 只改文件 <path>").toBeTruthy();
      files.add(m![1]!);
    }
    expect(files.size).toBe(2);
  });
});
