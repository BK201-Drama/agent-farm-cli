import { describe, expect, it } from "vitest";

const polishFourOpencodeParallelWave: unknown[] = [
  { task_id: "four-p-0", dedupe_key: "four-p-0", mode: "execute", prompt: "只改 `synthetic/f0.txt`" },
  { task_id: "four-p-1", dedupe_key: "four-p-1", mode: "execute", prompt: "只改 `synthetic/f1.txt`" },
  { task_id: "four-p-2", dedupe_key: "four-p-2", mode: "execute", prompt: "只改 `synthetic/f2.txt`" },
  { task_id: "four-p-3", dedupe_key: "four-p-3", mode: "execute", prompt: "只改 `synthetic/f3.txt`" },
];

describe("four-task opencode parallel wave shape (inline fixture)", () => {
  it("has four execute tasks with distinct task_id and disjoint primary file hints", () => {
    const arr = polishFourOpencodeParallelWave;
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
