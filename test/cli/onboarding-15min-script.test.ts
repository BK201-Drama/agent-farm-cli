import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const script = join(repoRoot, "scripts/onboarding-15min-check.mjs");

describe("onboarding-15min-check.mjs (TDD / CLI integration)", () => {
  it("script file exists", () => {
    expect(existsSync(script)).toBe(true);
  });

  it("runs with onboarding-15min-check: OK when build present", () => {
    const r = spawnSync(process.execPath, [script], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, AGENT_FARM_SKIP_OPENCODE_PROBE: "1" },
    });
    expect(r.status, `${r.stderr}\n${r.stdout}`).toBe(0);
    expect(r.stdout).toMatch(/onboarding-15min-check: OK/);
    expect(r.stdout).toMatch(/✓ CLI --version/);
  }, 120_000);
});
