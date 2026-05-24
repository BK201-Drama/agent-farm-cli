import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  cleanupOrphanWorktrees,
  detectOrphanWorktrees,
  runResourceLeakScan,
  scanGitLocks,
} from "../../src/application/resource-leak-scanner.js";

function san(id: string): string {
  return id.replace(/[/\\:*?"<>|]+/g, "_").replace(/\s+/g, "_");
}

describe("scanGitLocks", () => {
  let tmp: string;
  let gitDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "af-scan-lock-"));
    gitDir = join(tmp, ".git");
    mkdirSync(gitDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns empty array when no lock files exist", () => {
    expect(scanGitLocks(tmp)).toEqual([]);
  });

  it("detects index.lock", () => {
    writeFileSync(join(gitDir, "index.lock"), "");
    const result = scanGitLocks(tmp);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("index.lock");
  });

  it("detects HEAD.lock, shallow.lock, config.lock, packed-refs.lock", () => {
    for (const name of ["HEAD.lock", "shallow.lock", "config.lock", "packed-refs.lock"]) {
      writeFileSync(join(gitDir, name), "");
    }
    const result = scanGitLocks(tmp);
    expect(result).toHaveLength(4);
    expect(result.map((r) => r.name).sort()).toEqual([
      "HEAD.lock",
      "config.lock",
      "packed-refs.lock",
      "shallow.lock",
    ]);
  });

  it("detects branch lock files under refs/heads", () => {
    const refs = join(gitDir, "refs", "heads");
    mkdirSync(refs, { recursive: true });
    writeFileSync(join(refs, "feature.lock"), "");
    writeFileSync(join(refs, "main.lock"), "");
    const result = scanGitLocks(tmp);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name).sort()).toEqual(["feature.lock", "main.lock"]);
  });

  it("handles missing refs/heads gracefully", () => {
    writeFileSync(join(gitDir, "index.lock"), "");
    const result = scanGitLocks(tmp);
    expect(result).toHaveLength(1);
  });
});

describe("detectOrphanWorktrees", () => {
  let tmp: string;
  let base: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "af-detect-ow-"));
    base = join(tmp, "worktrees");
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns empty array when base path does not exist", () => {
    expect(detectOrphanWorktrees(base, ["t1", "t2"], san)).toEqual([]);
  });

  it("returns empty array when all directories match active task IDs", () => {
    mkdirSync(base, { recursive: true });
    mkdirSync(join(base, san("task-1")), { recursive: true });
    mkdirSync(join(base, san("task-2")), { recursive: true });
    const result = detectOrphanWorktrees(base, ["task-1", "task-2"], san);
    expect(result).toEqual([]);
  });

  it("returns directories not matching active task IDs", () => {
    mkdirSync(base, { recursive: true });
    mkdirSync(join(base, san("task-1")), { recursive: true });
    mkdirSync(join(base, san("orphan-1")), { recursive: true });
    const result = detectOrphanWorktrees(base, ["task-1"], san);
    expect(result).toHaveLength(1);
    expect(result[0].worktree_id).toBe(san("orphan-1"));
    expect(result[0].path).toBe(join(base, san("orphan-1")));
  });

  it("returns multiple orphan directories", () => {
    mkdirSync(base, { recursive: true });
    mkdirSync(join(base, san("task-1")), { recursive: true });
    mkdirSync(join(base, san("orphan-1")), { recursive: true });
    mkdirSync(join(base, san("orphan-2")), { recursive: true });
    const result = detectOrphanWorktrees(base, ["task-1"], san);
    expect(result).toHaveLength(2);
  });

  it("returns all directories when no active tasks", () => {
    mkdirSync(base, { recursive: true });
    mkdirSync(join(base, san("a")), { recursive: true });
    mkdirSync(join(base, san("b")), { recursive: true });
    const result = detectOrphanWorktrees(base, [], san);
    expect(result).toHaveLength(2);
  });
});

describe("cleanupOrphanWorktrees", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "af-clean-ow-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("removes orphan worktree directories", () => {
    const d1 = join(tmp, "orphan-1");
    const d2 = join(tmp, "orphan-2");
    mkdirSync(d1, { recursive: true });
    mkdirSync(d2, { recursive: true });
    writeFileSync(join(d1, "file.txt"), "data");
    const result = cleanupOrphanWorktrees([
      { worktree_id: "orphan-1", path: d1 },
      { worktree_id: "orphan-2", path: d2 },
    ]);
    expect(result.cleaned.sort()).toEqual(["orphan-1", "orphan-2"]);
    expect(result.errors).toHaveLength(0);
    expect(existsSync(d1)).toBe(false);
    expect(existsSync(d2)).toBe(false);
  });

  it("handles missing directories without crashing", () => {
    const d1 = join(tmp, "orphan-1");
    const d2 = join(tmp, "nonexistent");
    mkdirSync(d1, { recursive: true });
    const result = cleanupOrphanWorktrees([
      { worktree_id: "orphan-1", path: d1 },
      { worktree_id: "nonexistent", path: d2 },
    ]);
    // d1 should always be cleaned
    expect(result.cleaned).toContain("orphan-1");
    // non-existent path: on Windows rmSync force succeeds silently (counts as cleaned);
    // on Unix it throws (counts as error). Either way, the function must not crash.
    expect(result.errors.length + result.cleaned.length).toBe(2);
    expect(existsSync(d1)).toBe(false);
  });

  it("returns empty when input is empty", () => {
    const result = cleanupOrphanWorktrees([]);
    expect(result.cleaned).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});

describe("runResourceLeakScan", () => {
  let tmp: string;
  let gitDir: string;
  let wtBase: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "af-scan-"));
    gitDir = join(tmp, ".git");
    mkdirSync(gitDir, { recursive: true });
    wtBase = join(tmp, "worktrees");
    mkdirSync(wtBase, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("scans both git locks and orphan worktrees", () => {
    writeFileSync(join(gitDir, "index.lock"), "");
    mkdirSync(join(wtBase, san("orphan-1")), { recursive: true });
    mkdirSync(join(wtBase, san("task-1")), { recursive: true });

    const result = runResourceLeakScan({
      gitTop: tmp,
      worktreeBasePath: wtBase,
      activeTaskIds: ["task-1"],
      sanitize: san,
    });
    expect(result.git_locks).toHaveLength(1);
    expect(result.git_locks[0].name).toBe("index.lock");
    expect(result.orphan_worktrees).toHaveLength(1);
    expect(result.orphan_worktrees[0].worktree_id).toBe(san("orphan-1"));
  });

  it("handles null gitTop", () => {
    const result = runResourceLeakScan({
      gitTop: null,
      worktreeBasePath: wtBase,
      activeTaskIds: [],
      sanitize: san,
    });
    expect(result.git_locks).toEqual([]);
  });

  it("handles null worktreeBasePath", () => {
    writeFileSync(join(gitDir, "index.lock"), "");
    const result = runResourceLeakScan({
      gitTop: tmp,
      worktreeBasePath: null,
      activeTaskIds: ["task-1"],
      sanitize: san,
    });
    expect(result.git_locks).toHaveLength(1);
    expect(result.orphan_worktrees).toEqual([]);
  });

  it("returns empty scan when all clean", () => {
    mkdirSync(join(wtBase, san("task-1")), { recursive: true });
    const result = runResourceLeakScan({
      gitTop: tmp,
      worktreeBasePath: wtBase,
      activeTaskIds: ["task-1"],
      sanitize: san,
    });
    expect(result.git_locks).toEqual([]);
    expect(result.orphan_worktrees).toEqual([]);
  });
});
