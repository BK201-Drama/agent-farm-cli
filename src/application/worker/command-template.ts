import type { JsonMap } from "../../domain/task.js";

export type TemplateContext = {
  prompt: string;
  task_id: string;
  runs_dir: string;
  workspace: string;
  acceptance_criteria: string;
};

export function buildTemplateContextFromTask(
  task: JsonMap,
  runsDir: string,
  workspaceDir: string
): TemplateContext {
  return {
    prompt: String(task.prompt ?? ""),
    task_id: String(task.task_id ?? ""),
    runs_dir: runsDir,
    workspace: workspaceDir,
    acceptance_criteria: String(task.acceptance_criteria ?? ""),
  };
}

export function expandCommandTemplate(tpl: string, ctx: TemplateContext): string {
  return tpl
    .replace(/\{prompt\}/g, JSON.stringify(ctx.prompt))
    .replace(/\{task_id\}/g, ctx.task_id)
    .replace(/\{runs_dir\}/g, ctx.runs_dir)
    .replace(/\{workspace\}/g, ctx.workspace)
    .replace(/\{acceptance_criteria\}/g, JSON.stringify(ctx.acceptance_criteria));
}
