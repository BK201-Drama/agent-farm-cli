import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const wavePath = join(repoRoot, "test/fixtures/waves/polish-four-opencode-parallel.json");

describe("test/fixtures/waves/polish-four-opencode-parallel.json", () => {
  it("has four execute tasks with distinct task_id and disjoint primary file hints", () => {
    const arr = JSON.parse(readFileSync(wavePath, "utf8")) as unknown[];
    expect(arr).toHaveLength(4);
    const ids = new Set<string>();
    const files: string[] = [];
    for (const t of arr) {
      const o = t as Record<string, unknown>;
      expect(String(o.mode ?? "")).toBe("execute");
      const id = String(o.task_id ?? "").trim();
      expect(id.length).toBeGreaterThan(0);
      expect(ids.has(id)).toBe(false);
      ids.add(id);
      expect(String(o.dedupe_key ?? "").trim()).toBe(id);
      const prompt = String(o.prompt ?? "");
      const m = prompt.match(/只改 `([^`]+)`/);
      expect(m).toBeTruthy();
      files.push(m![1]!);
    }
    expect(new Set(files).size).toBe(4);
  });
});
