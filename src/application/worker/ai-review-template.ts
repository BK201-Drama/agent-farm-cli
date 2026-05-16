import type { JsonMap } from "../../domain/task.js";

/** 解析本条任务实际执行的 AI 验收命令模板（trim 后非空才执行） */
export function resolveAiReviewCommandTemplate(task: JsonMap, globalTemplate: string): string {
  if (task.skip_ai_review === true) return "";
  const perTask = String(task.ai_review_command_template ?? "").trim();
  if (perTask) return perTask;
  return String(globalTemplate ?? "").trim();
}

/** 去掉上一轮 [ai-review-fix] 块，避免与 [opencode-heal] 等重试附加堆叠 */
export function stripAiReviewFixAppendix(prompt: string): string {
  return prompt.replace(/\n\n\[ai-review-fix\][\s\S]*$/, "").trimEnd();
}

export function resolveAiReviewMinDiffLines(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.AGENT_FARM_AI_REVIEW_MIN_DIFF_LINES);
  if (!Number.isFinite(n) || n < 0) return 200;
  return Math.floor(n);
}

/** 未开 require-ai-review 时：小 diff 跳过全局 AI 验收（默认阈值 200 行）。 */
export function shouldSkipAiReviewForSmallDiff(
  task: JsonMap,
  globalTemplate: string,
  requireAiReview: boolean,
  diffLines: number,
): boolean {
  if (requireAiReview) return false;
  if (task.skip_ai_review === true) return true;
  const tpl = resolveAiReviewCommandTemplate(task, globalTemplate);
  if (!tpl) return true;
  const min = resolveAiReviewMinDiffLines();
  return diffLines > 0 && diffLines < min;
}
