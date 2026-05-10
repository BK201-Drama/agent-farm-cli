import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const wavePath = join(repoRoot, "test/fixtures/waves/polish-backlog-20260510.json");

describe("test/fixtures/waves/polish-backlog-20260510.json", () => {
  it("is a non-empty array; each item has task_id, dedupe_key, prompt; mixes plan and execute", () => {
    const raw = JSON.parse(readFileSync(wavePath, "utf8")) as unknown[];
    expect(Array.isArray(raw)).toBe(true);
    expect(raw.length).toBeGreaterThan(0);
    for (const t of raw) {
      expect(t && typeof t === "object").toBe(true);
      const o = t as Record<string, unknown>;
      expect(String(o.task_id ?? "").trim().length).toBeGreaterThan(0);
      expect(String(o.dedupe_key ?? "").trim().length).toBeGreaterThan(0);
      expect(String(o.prompt ?? "").trim().length).toBeGreaterThan(0);
    }
    expect(raw.some((t) => (t as { mode?: string }).mode === "plan")).toBe(true);
    expect(raw.some((t) => (t as { mode?: string }).mode === "execute")).toBe(true);
  });
});
