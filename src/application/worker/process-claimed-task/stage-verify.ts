import {
  basePromptForRetry,
  emitOpencodeStreamDiag,
  healBlockFromObserver,
} from "../opencode-retry-diag.js";
import type { ClaimedTaskShellContext } from "./context.js";
import { appendTaskFailedRetry } from "./events.js";
import { runTemplateStage } from "./run-template-stage.js";
import { createShellStageExecutor } from "./stage-execute.js";
import { VERIFY_ERROR_CAP } from "../worker-output-limits.js";

export async function runVerifyStageIfConfigured(
  ctx: ClaimedTaskShellContext,
  verifyCommandTemplate: string,
): Promise<{ ok: true } | { ok: false }> {
  if (!String(verifyCommandTemplate ?? "").trim()) {
    return { ok: true };
  }
  const { exit_code: verifyCode, output: verifyOut, streamObs: verifyStream } = await runTemplateStage(
    ctx,
    createShellStageExecutor(ctx, verifyCommandTemplate),
  );
  if (verifyCode !== 0) {
    const attemptPlus1 = ctx.taskAttempt + 1;
    const healBlock = healBlockFromObserver(verifyStream);
    await emitOpencodeStreamDiag(ctx.eventRepo, ctx.clock, ctx.taskId, attemptPlus1, "verify", verifyStream);
    const basePrompt = basePromptForRetry(String(ctx.task.prompt ?? ""));
    await ctx.taskCommands.updateStatus(ctx.taskId, "retry", {
      attempt: attemptPlus1,
      last_error: `verify failed\n${verifyOut.slice(0, VERIFY_ERROR_CAP)}`,
      ...(healBlock ? { prompt: `${basePrompt}\n\n[opencode-heal]\n${healBlock}` } : {}),
    });
    await appendTaskFailedRetry(ctx.eventRepo, ctx.clock, ctx.taskId, attemptPlus1, "verify");
    return { ok: false };
  }
  return { ok: true };
}
