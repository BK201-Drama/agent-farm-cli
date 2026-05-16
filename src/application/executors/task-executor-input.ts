import type { TaskExecutorRunInput } from "../../domain/ports/task-executor.js";
import type { JsonMap } from "../../domain/task.js";

export function readPathsFromTask(task: JsonMap): string[] {
  const raw = task.read_paths;
  if (Array.isArray(raw)) {
    return raw.map((p) => String(p).trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(/[,\n]/)
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return [];
}

/** 将 wave `read_paths` 注入 prompt（避免重复块） */
export function enrichPromptWithReadPaths(prompt: string, paths: string[]): string {
  if (!paths.length) return prompt;
  if (/\[read_paths\]/i.test(prompt)) return prompt;
  const block = paths.map((p) => `- ${p}`).join("\n");
  return `${prompt}\n\n[read_paths]\n${block}`;
}

export function buildTaskExecutorRunInput(
  task: JsonMap,
  taskId: string,
  workspaceDir: string,
  attempt: number,
): TaskExecutorRunInput {
  const paths = readPathsFromTask(task);
  return {
    task_id: taskId,
    prompt: enrichPromptWithReadPaths(String(task.prompt ?? ""), paths),
    workspace_dir: workspaceDir,
    attempt,
    read_paths: paths,
  };
}
