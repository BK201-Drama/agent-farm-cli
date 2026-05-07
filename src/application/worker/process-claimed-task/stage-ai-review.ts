import { resolveAiReviewCommandTemplate } from "../ai-review-template.js";
import { expandCommandTemplate } from "../command-template.js";
import {
  basePromptForRetry,
  emitOpencodeStreamDiag,
  healBlockFromObserver,
} from "../opencode-retry-diag.js";
import type { ClaimedTaskShellContext } from "./context.js";
import { appendTaskFailedRetry, taskEvent } from "./events.js";
import { runShellWithOptionalOpencodeJsonStream } from "../run-opencode-aware-shell.js";
import {
  AI_REVIEW_ERROR_CAP,
  AI_REVIEW_FIX_PROMPT_APPEND_CAP,
} from "../worker-output-limits.js";

export type AiReviewStageResult =
  | { kind: "blocked" }
  | { kind: "fail" }
  | { kind: "ok"; output?: string };

export async function runAiReviewStage(
  ctx: ClaimedTaskShellContext,
  opts: {
    aiReviewCommandTemplate: string;
    requireAiReview: boolean;
  },
): Promise<AiReviewStageResult> {
  const aiTpl = resolveAiReviewCommandTemplate(ctx.task, String(opts.aiReviewCommandTemplate ?? ""));
  if (opts.requireAiReview && ctx.task.skip_ai_review !== true && !aiTpl) {
    await ctx.taskCommands.updateStatus(ctx.taskId, "blocked", {
      blocked_reason:
        "require-ai-review: missing template (set worker --ai-review-command-template or task ai_review_command_template)",
    });
    await ctx.eventRepo.append(
      taskEvent({
        ts: ctx.clock(),
        event: "task_blocked",
        task_id: ctx.taskId,
        reason: "require_ai_review_no_template",
      }),
    );
    return { kind: "blocked" };
  }

  if (!aiTpl) {
    return { kind: "ok", output: undefined };
  }

  const aiCmd = expandCommandTemplate(aiTpl, ctx.tplCtx());
  const { exitCode: aiCode, output: aiOut, streamObs: aiStream } =
    await runShellWithOptionalOpencodeJsonStream(aiCmd, {
      runShell: ctx.runShell,
      onHeartbeat: ctx.heartbeat,
      env: ctx.env,
      enableStream: ctx.opencodeJsonEvents,
    });
  if (aiCode !== 0) {
    const attemptPlus1 = ctx.taskAttempt + 1;
    const fixBlock = aiOut.slice(0, AI_REVIEW_FIX_PROMPT_APPEND_CAP);
    const healBlock = healBlockFromObserver(aiStream);
    await emitOpencodeStreamDiag(ctx.eventRepo, ctx.clock, ctx.taskId, attemptPlus1, "ai_review", aiStream);
    const basePrompt = basePromptForRetry(String(ctx.task.prompt ?? ""));
    const promptParts = [`${basePrompt}\n\n[ai-review-fix]\n${fixBlock}`];
    if (healBlock) promptParts.push(`\n\n[opencode-heal]\n${healBlock}`);
    await ctx.taskCommands.updateStatus(ctx.taskId, "retry", {
      attempt: attemptPlus1,
      last_error: `ai-review failed\n${aiOut.slice(0, AI_REVIEW_ERROR_CAP)}`,
      prompt: promptParts.join(""),
    });
    await appendTaskFailedRetry(ctx.eventRepo, ctx.clock, ctx.taskId, attemptPlus1, "ai_review");
    return { kind: "fail" };
  }

  await ctx.eventRepo.append(taskEvent({ ts: ctx.clock(), event: "task_ai_review_ok", task_id: ctx.taskId }));
  return { kind: "ok", output: aiOut };
}
