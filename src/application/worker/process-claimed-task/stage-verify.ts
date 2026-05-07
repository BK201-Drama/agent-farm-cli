import { expandCommandTemplate } from "../command-template.js";
import {
  basePromptForRetry,
  emitOpencodeStreamDiag,
  healBlockFromObserver,
} from "../opencode-retry-diag.js";
import type { ClaimedTaskShellContext } from "./context.js";
import { appendTaskFailedRetry } from "./events.js";
import { runShellWithOptionalOpencodeJsonStream } from "../run-opencode-aware-shell.js";
import { VERIFY_ERROR_CAP } from "../worker-output-limits.js";

export async function runVerifyStageIfConfigured(
  ctx: ClaimedTaskShellContext,
  verifyCommandTemplate: string,
): Promise<{ ok: true } | { ok: false }> {
  if (!String(verifyCommandTemplate ?? "").trim()) {
    return { ok: true };
  }
  const verifyCmd = expandCommandTemplate(verifyCommandTemplate, ctx.tplCtx());
  const { exitCode: verifyCode, output: verifyOut, streamObs: verifyStream } =
    await runShellWithOptionalOpencodeJsonStream(verifyCmd, {
      runShell: ctx.runShell,
      onHeartbeat: ctx.heartbeat,
      env: ctx.env,
      enableStream: ctx.opencodeJsonEvents,
    });
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
