import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { commitWorktreeSnapshot } from "../src/infrastructure/git/commit-worktree-snapshot.js";

function git(cwd: string, args: string[]): { status: number; out: string } {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return { status: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

describe("commitWorktreeSnapshot", () => {
  it("commits dirty tracked changes in a worktree", () => {
    const base = mkdtempSync(join(tmpdir(), "af-snap-"));
    expect(git(base, ["init", "-b", "main"]).status).toBe(0);
    writeFileSync(join(base, "a.txt"), "v0\n");
    expect(git(base, ["add", "a.txt"]).status).toBe(0);
    expect(
      git(base, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"]).status,
    ).toBe(0);

    const wtDir = join(base, "wt");
    expect(git(base, ["worktree", "add", "-b", "agent-farm/t1", wtDir]).status).toBe(0);

    writeFileSync(join(wtDir, "a.txt"), "v1\n");
    const prev = git(base, ["rev-parse", "agent-farm/t1"]).out.trim();

    const snap = commitWorktreeSnapshot(wtDir, "t1");
    expect(snap.dirty).toBe(true);
    expect(snap.ok).toBe(true);
    expect(snap.committed).toBe(true);

    const next = git(base, ["rev-parse", "agent-farm/t1"]).out.trim();
    expect(next).not.toBe(prev);
  });

  it("reports clean when nothing changed", () => {
    const base = mkdtempSync(join(tmpdir(), "af-snap-"));
    expect(git(base, ["init", "-b", "main"]).status).toBe(0);
    writeFileSync(join(base, "a.txt"), "v0\n");
    expect(git(base, ["add", "a.txt"]).status).toBe(0);
    expect(
      git(base, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"]).status,
    ).toBe(0);
    const wtDir = join(base, "wt");
    expect(git(base, ["worktree", "add", "-b", "agent-farm/t2", wtDir]).status).toBe(0);

    const snap = commitWorktreeSnapshot(wtDir, "t2");
    expect(snap.dirty).toBe(false);
    expect(snap.ok).toBe(true);
    expect(snap.committed).toBe(false);
  });

  it("stages ignored .agent-farm/runs by default so snapshot is not empty", () => {
    const base = mkdtempSync(join(tmpdir(), "af-snap-"));
    expect(git(base, ["init", "-b", "main"]).status).toBe(0);
    writeFileSync(join(base, ".gitignore"), ".agent-farm/\n");
    writeFileSync(join(base, "a.txt"), "v0\n");
    expect(git(base, ["add", ".gitignore", "a.txt"]).status).toBe(0);
    expect(
      git(base, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"]).status,
    ).toBe(0);

    const wtDir = join(base, "wt");
    expect(git(base, ["worktree", "add", "-b", "agent-farm/t3", wtDir]).status).toBe(0);

    const runsFile = join(wtDir, ".agent-farm", "runs", "log.txt");
    mkdirSync(join(wtDir, ".agent-farm", "runs"), { recursive: true });
    writeFileSync(runsFile, "artifact\n");

    expect(git(wtDir, ["status", "--porcelain"]).out.trim()).toBe("");

    const prev = git(base, ["rev-parse", "agent-farm/t3"]).out.trim();
    const snap = commitWorktreeSnapshot(wtDir, "t3");
    expect(snap.dirty).toBe(true);
    expect(snap.ok).toBe(true);
    expect(snap.committed).toBe(true);
    expect(git(base, ["rev-parse", "agent-farm/t3"]).out.trim()).not.toBe(prev);
  });

  it("honors AGENT_FARM_WORKTREE_SNAPSHOT_FORCE_ADD for other ignored paths", () => {
    const prevForce = process.env.AGENT_FARM_WORKTREE_SNAPSHOT_FORCE_ADD;
    process.env.AGENT_FARM_WORKTREE_SNAPSHOT_FORCE_ADD = "out/x.txt";

    try {
      const base = mkdtempSync(join(tmpdir(), "af-snap-"));
      expect(git(base, ["init", "-b", "main"]).status).toBe(0);
      writeFileSync(join(base, ".gitignore"), "out/\n");
      writeFileSync(join(base, "a.txt"), "v0\n");
      expect(git(base, ["add", ".gitignore", "a.txt"]).status).toBe(0);
      expect(
        git(base, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"]).status,
      ).toBe(0);

      const wtDir = join(base, "wt");
      expect(git(base, ["worktree", "add", "-b", "agent-farm/t4", wtDir]).status).toBe(0);

      mkdirSync(join(wtDir, "out"), { recursive: true });
      writeFileSync(join(wtDir, "out", "x.txt"), "hidden\n");

      const snap = commitWorktreeSnapshot(wtDir, "t4");
      expect(snap.dirty).toBe(true);
      expect(snap.ok).toBe(true);
      expect(snap.committed).toBe(true);
    } finally {
      if (prevForce === undefined) delete process.env.AGENT_FARM_WORKTREE_SNAPSHOT_FORCE_ADD;
      else process.env.AGENT_FARM_WORKTREE_SNAPSHOT_FORCE_ADD = prevForce;
    }
  });
});
