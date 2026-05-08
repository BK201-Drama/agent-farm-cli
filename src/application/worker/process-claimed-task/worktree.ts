import type { JsonMap } from "../../../domain/task.js";
import type { IsoClock } from "../../../domain/ports/clock.js";
import type { EventRepository } from "../../../domain/ports/repositories.js";
import type { ClaimedTaskCommands } from "../../contracts/claimed-task-commands.js";
import { createAgentFarmWorktree, resolveGitTopLevel } from "../../../infrastructure/git/agent-farm-worktree.js";
import { EXEC_OUTPUT_CAP } from "../worker-output-limits.js";
import { taskEvent } from "./events.js";

export type ResolvedTaskWorkspace = {
  rootForNode: string;
  taskWorkspace: string;
  worktreeBranch?: string;
  disposeWorktree?: () => void;
};

const WORKTREE_NON_RECOVERABLE_PATTERNS = [
  "git worktree add failed",
  "requires a git repository",
];

function isWorktreeNonRecoverable(msg: string): boolean {
  const lower = msg.toLowerCase();
  return WORKTREE_NON_RECOVERABLE_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

export async function resolveTaskWorkspaceForClaimedTask(opts: {
  gitWorktreeParallel: boolean;
  mainWorkspace: string;
  taskId: string;
  task: JsonMap;
  taskCommands: ClaimedTaskCommands;
  eventRepo: EventRepository;
  clock: IsoClock;
}): Promise<ResolvedTaskWorkspace | null> {
  const { gitWorktreeParallel, mainWorkspace, taskId, task, taskCommands, eventRepo, clock } = opts;
  const rootForNode = resolveGitTopLevel(mainWorkspace) ?? mainWorkspace;
  if (!gitWorktreeParallel) {
    return { rootForNode, taskWorkspace: mainWorkspace };
  }
  try {
    const wt = createAgentFarmWorktree(mainWorkspace, taskId);
    return {
      rootForNode,
      taskWorkspace: wt.path,
      worktreeBranch: wt.branch,
      disposeWorktree: wt.dispose,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const attempt = Number(task.attempt ?? 0);
    const nonRecoverable = isWorktreeNonRecoverable(msg);
    const status = nonRecoverable ? "failed" : "retry";
    const errorPrefix = nonRecoverable ? "worktree:failed: " : "worktree:retry: ";
    await taskCommands.updateStatus(taskId, status, {
      attempt: attempt + 1,
      last_error: (errorPrefix + msg).slice(0, EXEC_OUTPUT_CAP),
    });
    await eventRepo.append(
      taskEvent({
        ts: clock(),
        event: "task_failed",
        task_id: taskId,
        attempt: attempt + 1,
        stage: "worktree",
      })
    );
    return null;
  }
}
