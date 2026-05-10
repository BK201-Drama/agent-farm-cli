import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const wavePath = join(repoRoot, "test/fixtures/waves/polish-opt-20260511.json");

describe("test/fixtures/waves/polish-opt-20260511.json", () => {
  it("six entries; plan + execute mix", () => {
    const raw = JSON.parse(readFileSync(wavePath, "utf8")) as unknown[];
    expect(raw).toHaveLength(6);
    const modes = raw.map((t) => (t as { mode?: string }).mode);
    expect(modes.filter((m) => m === "plan").length).toBe(1);
    expect(modes.filter((m) => m === "execute").length).toBe(5);
    for (const t of raw) {
      const o = t as Record<string, unknown>;
      expect(String(o.task_id ?? "").trim().length).toBeGreaterThan(0);
      expect(String(o.dedupe_key ?? "").trim().length).toBeGreaterThan(0);
      expect(String(o.prompt ?? "").trim().length).toBeGreaterThan(0);
    }
  });
});
