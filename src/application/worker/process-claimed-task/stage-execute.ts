import { expandCommandTemplate } from "../command-template.js";
import {
  basePromptForRetry,
  emitOpencodeStreamDiag,
  healBlockFromObserver,
} from "../opencode-retry-diag.js";
import type { ClaimedTaskShellContext } from "./context.js";
import { appendTaskFailedRetry } from "./events.js";
import { runShellWithOptionalOpencodeJsonStream } from "../run-opencode-aware-shell.js";
import { writeExecuteStageReport } from "../execute-stage-report.js";
import { EXEC_OUTPUT_CAP } from "../worker-output-limits.js";

export async function runExecuteStage(
  ctx: ClaimedTaskShellContext,
  commandTemplate: string,
): Promise<{ ok: true; output: string } | { ok: false }> {
  const execCmd = expandCommandTemplate(commandTemplate, ctx.tplCtx());
  const { exitCode: execCode, output: execOut, streamObs: execStream } =
    await runShellWithOptionalOpencodeJsonStream(execCmd, {
      runShell: ctx.runShell,
      onHeartbeat: ctx.heartbeat,
      env: ctx.env,
      enableStream: ctx.opencodeJsonEvents,
    });
  if (execCode !== 0) {
    const attemptPlus1 = ctx.taskAttempt + 1;
    const healBlock = healBlockFromObserver(execStream);
    await emitOpencodeStreamDiag(ctx.eventRepo, ctx.clock, ctx.taskId, attemptPlus1, "execute", execStream);
    const basePrompt = basePromptForRetry(String(ctx.task.prompt ?? ""));
    await ctx.taskCommands.updateStatus(ctx.taskId, "retry", {
      attempt: attemptPlus1,
      last_error: execOut.slice(0, EXEC_OUTPUT_CAP),
      ...(healBlock ? { prompt: `${basePrompt}\n\n[opencode-heal]\n${healBlock}` } : {}),
    });
    await appendTaskFailedRetry(ctx.eventRepo, ctx.clock, ctx.taskId, attemptPlus1, "execute");
    writeExecuteStageReport(
      ctx.runsDir,
      ctx.taskId,
      attemptPlus1,
      ctx.clock(),
      execCode,
      execOut,
    );
    return { ok: false };
  }
  const attempt = ctx.taskAttempt;
  writeExecuteStageReport(ctx.runsDir, ctx.taskId, attempt, ctx.clock(), 0, execOut);
  return { ok: true, output: execOut };
}
