import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import {
  createEmptyRunMonitor,
  hasWorkingTreeChanges,
} from "../../src/application/worker/empty-run-monitor.js";

describe("empty-run monitor", () => {
  it("hasWorkingTreeChanges detects porcelain", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-er-"));
    execSync("git init", { cwd: dir, stdio: "ignore" });
    execSync('git config user.email "t@t.com"', { cwd: dir, stdio: "ignore" });
    execSync('git config user.name "t"', { cwd: dir, stdio: "ignore" });
    writeFileSync(join(dir, "a.txt"), "x", "utf8");
    execSync("git add a.txt", { cwd: dir, stdio: "ignore" });
    execSync('git commit -m "init"', { cwd: dir, stdio: "ignore" });
    expect(hasWorkingTreeChanges(dir)).toBe(false);
    writeFileSync(join(dir, "b.txt"), "y", "utf8");
    expect(hasWorkingTreeChanges(dir)).toBe(true);
  });

  it("aborts after grace when no git diff, low opencode, no report", () => {
    const dir = mkdtempSync(join(tmpdir(), "af-er-"));
    execSync("git init", { cwd: dir, stdio: "ignore" });
    execSync('git config user.email "t@t.com"', { cwd: dir, stdio: "ignore" });
    execSync('git config user.name "t"', { cwd: dir, stdio: "ignore" });
    writeFileSync(join(dir, "a.txt"), "x", "utf8");
    execSync("git add a.txt", { cwd: dir, stdio: "ignore" });
    execSync('git commit -m "init"', { cwd: dir, stdio: "ignore" });

    const runsDir = mkdtempSync(join(tmpdir(), "af-runs-"));
    const startedAtMs = Date.now() - 11 * 60_000;
    const monitor = createEmptyRunMonitor({
      workspaceDir: dir,
      runsDir,
      taskId: "t1",
      attempt: 0,
      config: { enabled: true, graceMinutes: 10, minOpencodeLines: 1 },
      startedAtMs,
      getStreamObs: () => undefined,
    });
    const r = monitor.check();
    expect(r.abort).toBe(true);
    expect(r.signals).toContain("no_git_diff");
    expect(r.signals).toContain("low_opencode_output");
    expect(r.signals).toContain("no_execute_report");
  });

  it("does not abort before grace", () => {
    const monitor = createEmptyRunMonitor({
      workspaceDir: ".",
      runsDir: ".",
      taskId: "t1",
      attempt: 0,
      config: { enabled: true, graceMinutes: 10, minOpencodeLines: 1 },
      startedAtMs: Date.now(),
      getStreamObs: () => undefined,
    });
    expect(monitor.check().abort).toBe(false);
  });
});
