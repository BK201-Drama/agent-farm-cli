import { describe, expect, it } from "vitest";
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
});
