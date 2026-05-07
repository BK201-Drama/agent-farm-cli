import { delimiter, join } from "node:path";

import type { JsonMap } from "../../domain/task.js";

/** Git Bash 下子进程更易解析的路径（Windows 反斜杠 → /）。 */
function posixFriendlyPath(p: string): string {
  return process.platform === "win32" ? p.replace(/\\/g, "/") : p;
}

/**
 * @param workspaceRootForDeps 含 node_modules 的仓库根；与 workspaceDir 不同时（git worktree）用于 PATH / npx --prefix
 * @param worktreeBranch 可选，传入则设置 AGENT_FARM_WORKTREE_BRANCH
 */
export function buildWorkerChildEnv(
  task: JsonMap,
  runsDir: string,
  workspaceDir: string,
  workspaceRootForDeps?: string,
  worktreeBranch?: string
): NodeJS.ProcessEnv {
  const rootNative = workspaceRootForDeps ?? workspaceDir;
  const ws = posixFriendlyPath(workspaceDir);
  const rootPosix = posixFriendlyPath(rootNative);
  const runs = posixFriendlyPath(runsDir);
  const localBin = posixFriendlyPath(join(rootNative, "node_modules", ".bin"));
  const pathPrefix = `${localBin}${delimiter}`;
  const mergedPath = process.env.PATH ? `${pathPrefix}${process.env.PATH}` : pathPrefix;
  return {
    ...process.env,
    PATH: mergedPath,
    AGENT_FARM_TASK_ID: String(task.task_id ?? ""),
    AGENT_FARM_RUNS_DIR: runs,
    AGENT_FARM_WORKSPACE: ws,
    AGENT_FARM_WORKSPACE_ROOT: rootPosix,
    AGENT_FARM_PROMPT: String(task.prompt ?? ""),
    ...(worktreeBranch ? { AGENT_FARM_WORKTREE_BRANCH: worktreeBranch } : {}),
  };
}
