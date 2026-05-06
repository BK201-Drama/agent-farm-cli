import { delimiter, join } from "node:path";

import type { JsonMap } from "../../domain/task.js";

/** Git Bash 下子进程更易解析的路径（Windows 反斜杠 → /）。 */
function posixFriendlyPath(p: string): string {
  return process.platform === "win32" ? p.replace(/\\/g, "/") : p;
}

export function buildWorkerChildEnv(
  task: JsonMap,
  runsDir: string,
  workspaceDir: string
): NodeJS.ProcessEnv {
  const ws = posixFriendlyPath(workspaceDir);
  const runs = posixFriendlyPath(runsDir);
  const localBin = posixFriendlyPath(join(workspaceDir, "node_modules", ".bin"));
  const pathPrefix = `${localBin}${delimiter}`;
  const mergedPath = process.env.PATH ? `${pathPrefix}${process.env.PATH}` : pathPrefix;
  return {
    ...process.env,
    PATH: mergedPath,
    AGENT_FARM_TASK_ID: String(task.task_id ?? ""),
    AGENT_FARM_RUNS_DIR: runs,
    AGENT_FARM_WORKSPACE: ws,
    AGENT_FARM_PROMPT: String(task.prompt ?? ""),
  };
}
