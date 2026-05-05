import type { JsonMap } from "../../domain/task.js";

/** 解析本条任务实际执行的 AI 验收命令模板（trim 后非空才执行） */
export function resolveAiReviewCommandTemplate(task: JsonMap, globalTemplate: string): string {
  if (task.skip_ai_review === true) return "";
  const perTask = String(task.ai_review_command_template ?? "").trim();
  if (perTask) return perTask;
  return String(globalTemplate ?? "").trim();
}
