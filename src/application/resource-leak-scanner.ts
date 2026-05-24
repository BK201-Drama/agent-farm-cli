import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { OrphanWorktreeEntry } from "./contracts/git-workspace.js";

export type GitLockEntry = {
  path: string;
  name: string;
};

export type ResourceLeakScan = {
  git_locks: GitLockEntry[];
  orphan_worktrees: OrphanWorktreeEntry[];
};

/** Lock files that git places in .git/ when operations are in progress. */
const GIT_LOCK_FILES = ["index.lock", "HEAD.lock", "shallow.lock", "config.lock", "packed-refs.lock"];

export function scanGitLocks(gitTop: string): GitLockEntry[] {
  const results: GitLockEntry[] = [];
  for (const name of GIT_LOCK_FILES) {
    const p = join(gitTop, ".git", name);
    if (existsSync(p)) {
      results.push({ path: p, name });
    }
  }
  const refsHeads = join(gitTop, ".git", "refs", "heads");
  try {
    if (existsSync(refsHeads)) {
      for (const entry of readdirSync(refsHeads, { recursive: true, withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".lock")) {
          results.push({ path: join(entry.parentPath ?? refsHeads, entry.name), name: entry.name });
        }
      }
    }
  } catch {
    /* best-effort */
  }
  return results;
}

export function detectOrphanWorktrees(
  worktreeBasePath: string,
  activeTaskIds: string[],
  sanitize: (id: string) => string,
): OrphanWorktreeEntry[] {
  if (!existsSync(worktreeBasePath)) return [];
  try {
    const known = new Set(activeTaskIds.map((id) => sanitize(id)));
    return readdirSync(worktreeBasePath)
      .filter((d) => !known.has(d))
      .map((d) => ({ worktree_id: d, path: join(worktreeBasePath, d) }));
  } catch {
    return [];
  }
}

export function cleanupOrphanWorktrees(orphans: OrphanWorktreeEntry[]): { cleaned: string[]; errors: string[] } {
  const cleaned: string[] = [];
  const errors: string[] = [];
  for (const o of orphans) {
    try {
      rmSync(o.path, { recursive: true, force: true });
      cleaned.push(o.worktree_id);
    } catch (e) {
      errors.push(`${o.worktree_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { cleaned, errors };
}

export function runResourceLeakScan(opts: {
  gitTop: string | null;
  worktreeBasePath: string | null;
  activeTaskIds: string[];
  sanitize: (id: string) => string;
}): ResourceLeakScan {
  const git_locks = opts.gitTop ? scanGitLocks(opts.gitTop) : [];
  const orphan_worktrees = opts.worktreeBasePath
    ? detectOrphanWorktrees(opts.worktreeBasePath, opts.activeTaskIds, opts.sanitize)
    : [];
  return { git_locks, orphan_worktrees };
}
