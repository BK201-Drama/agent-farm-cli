import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);

describe("onboarding-15min-check-lib (TDD)", () => {
  it("resolveCliArgv prefers dist when built", async () => {
    const { resolveCliArgv } = await import("../../scripts/lib/onboarding-15min-check-lib.mjs");
    const r = resolveCliArgv(repoRoot);
    if (existsSync(join(repoRoot, "dist/interfaces/cli/index.js"))) {
      expect(r.usesDist).toBe(true);
      expect(r.argv[0]).toMatch(/dist[\\/]interfaces[\\/]cli[\\/]index\.js$/);
    } else {
      expect(r.usesDist).toBe(false);
      expect(r.argv.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("mkIsolatedJsonlQueue creates empty jsonl queue files", async () => {
    const { mkIsolatedJsonlQueue } = await import("../../scripts/lib/onboarding-15min-check-lib.mjs");
    const { dir, q, taskFile, quarantineFile } = mkIsolatedJsonlQueue("af-tdd-");
    expect(existsSync(join(q, "tasks.jsonl"))).toBe(true);
    expect(existsSync(join(q, "events.jsonl"))).toBe(true);
    expect(existsSync(quarantineFile)).toBe(true);
    expect(readFileSync(taskFile, "utf8")).toBe("");
    expect(dir).toMatch(/af-tdd-/);
  });

  it("runCli --version exits 0", async () => {
    const { runCli } = await import("../../scripts/lib/onboarding-15min-check-lib.mjs");
    const r = runCli(repoRoot, ["--version"]);
    expect(r.status).toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/\d+\.\d+/);
  });

  it("runOnboardingChecks isolated demo+doctor succeed", async () => {
    const { runOnboardingChecks } = await import("../../scripts/lib/onboarding-15min-check-lib.mjs");
    const { steps, ok } = runOnboardingChecks({
      root: repoRoot,
      skipRepoDoctor: true,
      skipValidateWaves: true,
      skipValidateReports: true,
      skipEmbedMinimal: true,
    });
    const labels = steps.map((s) => s.label);
    expect(labels).toContain("CLI --version");
    expect(labels).toContain("demo task noop（隔离目录）");
    expect(labels).toContain("doctor --ci-exit（隔离空队列）");
    expect(ok).toBe(true);
  }, 60_000);
});
