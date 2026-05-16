import type { GitWorkspacePort } from "./git-workspace.js";
import type { ProjectConfigPort } from "./agent-farm-project-config.js";

export const noopGitWorkspacePort: GitWorkspacePort = {
  resolveGitTopLevel: () => null,
  sanitizeTaskIdForPath: (id) => id.replace(/[^a-zA-Z0-9._-]+/g, "_"),
  findOrphanWorktrees: () => [],
  createAgentFarmWorktree: () => {
    throw new Error("noop git port");
  },
  commitWorktreeSnapshot: () => ({ dirty: false, ok: true, committed: false, stdoutStderr: "" }),
  mergeAgentFarmBranchSerialized: async () => ({ ok: true, combined: "" }),
};

export const noopProjectConfigPort: ProjectConfigPort = {
  load: () => null,
};
