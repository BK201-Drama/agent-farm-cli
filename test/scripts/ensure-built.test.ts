import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const script = join(repoRoot, "scripts/ensure-built.mjs");

describe("ensure-built.mjs (TDD)", () => {
  it("exits 0 when dist markers already exist", () => {
    const r = spawnSync(process.execPath, [script], { cwd: repoRoot, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(existsSync(join(repoRoot, "dist/interfaces/cli/index.js"))).toBe(true);
  });
});
