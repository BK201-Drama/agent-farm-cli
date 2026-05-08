import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const examplePath = join(repoRoot, "examples/agent-farm-waves/example-wave.json");

describe("examples/agent-farm-waves/example-wave.json", () => {
  it("is a non-empty array; each item has task_id, dedupe_key, prompt; includes plan and execute", () => {
    const raw = JSON.parse(readFileSync(examplePath, "utf8")) as unknown[];
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
