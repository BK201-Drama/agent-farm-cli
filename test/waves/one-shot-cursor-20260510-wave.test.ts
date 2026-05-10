import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const wavePath = join(repoRoot, "test/fixtures/waves/one-shot-cursor-20260510.json");

describe("test/fixtures/waves/one-shot-cursor-20260510.json", () => {
  it("two execute tasks with ids and dedupe keys", () => {
    const raw = JSON.parse(readFileSync(wavePath, "utf8")) as unknown[];
    expect(raw).toHaveLength(2);
    for (const t of raw) {
      const o = t as Record<string, unknown>;
      expect(o.mode).toBe("execute");
      expect(String(o.task_id ?? "").length).toBeGreaterThan(0);
      expect(String(o.dedupe_key ?? "").length).toBeGreaterThan(0);
    }
  });
});
