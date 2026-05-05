import type { JsonMap } from "../../domain/task.js";

export function buildWorkerChildEnv(
  task: JsonMap,
  runsDir: string,
  workspaceDir: string
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AGENT_FARM_TASK_ID: String(task.task_id ?? ""),
    AGENT_FARM_RUNS_DIR: runsDir,
    AGENT_FARM_WORKSPACE: workspaceDir,
    AGENT_FARM_PROMPT: String(task.prompt ?? ""),
  };
}
