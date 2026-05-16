export type AgentFarmWorktreeHandle = {
  path: string;
  branch: string;
  dispose: () => void;
};

export type WorktreeSnapshotResult = {
  dirty: boolean;
  ok: boolean;
  committed: boolean;
  stdoutStderr: string;
};

export type MergeAgentFarmBranchResult =
  | { ok: true; combined: string }
  | { ok: false; combined: string; reason: string };

export type OrphanWorktreeEntry = {
  worktree_id: string;
  path: string;
};

export type GitWorkspacePort = {
  resolveGitTopLevel(mainWorkspace: string): string | null;
  sanitizeTaskIdForPath(taskId: string): string;
  findOrphanWorktrees(worktreeBasePath: string, activeTaskIds: string[]): OrphanWorktreeEntry[];
  createAgentFarmWorktree(mainWorkspace: string, taskId: string): AgentFarmWorktreeHandle;
  commitWorktreeSnapshot(taskWorkspace: string, taskId: string): WorktreeSnapshotResult;
  mergeAgentFarmBranchSerialized(
    gitTop: string,
    branch: string,
    taskId: string,
    completedAtIso?: string,
  ): Promise<MergeAgentFarmBranchResult>;
};
