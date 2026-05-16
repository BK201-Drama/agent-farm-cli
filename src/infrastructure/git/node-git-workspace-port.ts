import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GitWorkspacePort } from "../../application/contracts/git-workspace.js";
import { createAgentFarmWorktree, resolveGitTopLevel, sanitizeTaskIdForPath } from "./agent-farm-worktree.js";
import { commitWorktreeSnapshot } from "./commit-worktree-snapshot.js";
import { mergeAgentFarmBranchSerialized } from "./merge-agent-farm-branch.js";

export const nodeGitWorkspacePort: GitWorkspacePort = {
  resolveGitTopLevel,
  sanitizeTaskIdForPath,
  findOrphanWorktrees(worktreeBasePath: string, activeTaskIds: string[]) {
    if (!existsSync(worktreeBasePath)) return [];
    try {
      const known = new Set(activeTaskIds.map((id) => sanitizeTaskIdForPath(id)));
      return readdirSync(worktreeBasePath)
        .filter((d) => !known.has(d))
        .map((d) => ({ worktree_id: d, path: join(worktreeBasePath, d) }));
    } catch {
      return [];
    }
  },
  createAgentFarmWorktree,
  commitWorktreeSnapshot,
  mergeAgentFarmBranchSerialized,
};
