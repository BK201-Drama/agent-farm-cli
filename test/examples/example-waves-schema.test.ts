import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const wavesDir = join(repoRoot, "examples", "waves");

describe("examples/waves/*.json (schema-required fields)", () => {
  it("each item has task_id, dedupe_key, prompt; mode is plan or execute when set", () => {
    const files = readdirSync(wavesDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(wavesDir, file), "utf8")) as unknown[];
      expect(Array.isArray(raw), file).toBe(true);
      for (const t of raw) {
        const o = t as Record<string, unknown>;
        expect(String(o.task_id ?? "").trim(), file).not.toBe("");
        expect(String(o.dedupe_key ?? "").trim(), file).not.toBe("");
        expect(String(o.prompt ?? "").trim(), file).not.toBe("");
        const mode = o.mode;
        if (mode !== undefined && mode !== null && mode !== "") {
          expect(["plan", "execute"], file).toContain(mode);
        }
      }
    }
  });
});
