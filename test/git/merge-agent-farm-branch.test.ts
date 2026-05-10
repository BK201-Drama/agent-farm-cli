import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { mergeAgentFarmBranchSerialized } from "../../src/infrastructure/git/merge-agent-farm-branch.js";

function git(cwd: string, args: string[]): { status: number; out: string } {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return { status: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

describe("mergeAgentFarmBranchSerialized", () => {
  afterEach(() => {
    delete process.env.AGENT_FARM_AUTO_MERGE_STRATEGY;
  });

  it("stashes dirty main, merges feature branch, then stash pop", async () => {
    const base = mkdtempSync(join(tmpdir(), "af-merge-"));
    expect(git(base, ["init", "-b", "main"]).status).toBe(0);
    writeFileSync(join(base, "a.txt"), "main-v0\n");
    expect(git(base, ["add", "a.txt"]).status).toBe(0);
    expect(
      git(base, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"]).status,
    ).toBe(0);

    expect(git(base, ["branch", "agent-farm/task-x"]).status).toBe(0);
    expect(git(base, ["checkout", "agent-farm/task-x"]).status).toBe(0);
    writeFileSync(join(base, "b.txt"), "feat\n");
    expect(git(base, ["add", "b.txt"]).status).toBe(0);
    expect(git(base, ["commit", "-m", "feat"]).status).toBe(0);

    expect(git(base, ["checkout", "main"]).status).toBe(0);
    writeFileSync(join(base, "a.txt"), "main-v1-dirty\n");

    const r = await mergeAgentFarmBranchSerialized(base, "agent-farm/task-x", "task-x");
    expect(r.ok).toBe(true);
    expect(git(base, ["branch", "--show-current"]).out.trim()).toBe("main");
    expect(git(base, ["ls-files", "-m"]).out).toContain("a.txt");

    const log = git(base, ["log", "--oneline", "-3"]).out;
    expect(log).toContain("merge task task-x");
  });

  it("rebase strategy: fast-forward main with linear history", async () => {
    process.env.AGENT_FARM_AUTO_MERGE_STRATEGY = "rebase";
    const base = mkdtempSync(join(tmpdir(), "af-rebase-"));
    expect(git(base, ["init", "-b", "main"]).status).toBe(0);
    writeFileSync(join(base, "a.txt"), "main\n");
    expect(git(base, ["add", "a.txt"]).status).toBe(0);
    expect(
      git(base, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"]).status,
    ).toBe(0);

    expect(git(base, ["branch", "agent-farm/task-rb"]).status).toBe(0);
    expect(git(base, ["checkout", "agent-farm/task-rb"]).status).toBe(0);
    writeFileSync(join(base, "b.txt"), "feat\n");
    expect(git(base, ["add", "b.txt"]).status).toBe(0);
    expect(git(base, ["commit", "-m", "feat"]).status).toBe(0);

    expect(git(base, ["checkout", "main"]).status).toBe(0);
    writeFileSync(join(base, "a.txt"), "main-dirty\n");

    const r = await mergeAgentFarmBranchSerialized(base, "agent-farm/task-rb", "task-rb");
    expect(r.ok).toBe(true);
    expect(git(base, ["branch", "--show-current"]).out.trim()).toBe("main");
    expect(git(base, ["ls-files", "-m"]).out).toContain("a.txt");

    const log = git(base, ["log", "--oneline", "-5"]).out;
    expect(log).toContain("feat");
    expect(log).not.toContain("merge task task-rb");
  });

  it("orders concurrent merges by completedAtIso (earlier task merges first)", async () => {
    const base = mkdtempSync(join(tmpdir(), "af-order-"));
    expect(git(base, ["init", "-b", "main"]).status).toBe(0);
    writeFileSync(join(base, "root.txt"), "r\n");
    expect(git(base, ["add", "root.txt"]).status).toBe(0);
    expect(
      git(base, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"]).status,
    ).toBe(0);

    expect(git(base, ["branch", "agent-farm/ord-a"]).status).toBe(0);
    expect(git(base, ["checkout", "agent-farm/ord-a"]).status).toBe(0);
    writeFileSync(join(base, "a-only.txt"), "a\n");
    expect(git(base, ["add", "a-only.txt"]).status).toBe(0);
    expect(git(base, ["commit", "-m", "commit-a"]).status).toBe(0);

    expect(git(base, ["checkout", "main"]).status).toBe(0);
    expect(git(base, ["branch", "agent-farm/ord-b"]).status).toBe(0);
    expect(git(base, ["checkout", "agent-farm/ord-b"]).status).toBe(0);
    writeFileSync(join(base, "b-only.txt"), "b\n");
    expect(git(base, ["add", "b-only.txt"]).status).toBe(0);
    expect(git(base, ["commit", "-m", "commit-b"]).status).toBe(0);

    expect(git(base, ["checkout", "main"]).status).toBe(0);

    const [ra, rb] = await Promise.all([
      mergeAgentFarmBranchSerialized(base, "agent-farm/ord-b", "ord-b", "2026-05-10T02:00:00.000Z"),
      mergeAgentFarmBranchSerialized(base, "agent-farm/ord-a", "ord-a", "2026-05-10T01:00:00.000Z"),
    ]);
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(true);

    const subj = git(base, ["log", "--format=%s", "-5"]).out;
    const iB = subj.indexOf("merge task ord-b");
    const iA = subj.indexOf("merge task ord-a");
    expect(iB).toBeGreaterThanOrEqual(0);
    expect(iA).toBeGreaterThanOrEqual(0);
    expect(iB).toBeLessThan(iA);
  });
});
