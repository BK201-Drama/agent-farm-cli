import { basePromptForRetry, emitOpencodeStreamDiag, healBlockFromObserver } from "../opencode-retry-diag.js";
import { resolveExecuteExecutor } from "../../executors/resolve-execute-executor.js";
import { createShellTemplateExecutor } from "../../executors/shell-template-executor.js";
import type { ClaimedTaskShellContext } from "./context.js";
import { appendTaskFailedRetry } from "./events.js";
import type { OpencodeStreamObserver } from "../../../infrastructure/executors/opencode-shell-runner.js";
import { runTemplateStage } from "./run-template-stage.js";
import { writeExecuteStageReport } from "../execute-stage-report.js";
import { EXEC_OUTPUT_CAP } from "../worker-output-limits.js";
import { createEmptyRunMonitor } from "../empty-run-monitor.js";
import { handleEmptyRunAbort, isEmptyRunAbort } from "../empty-run-action.js";

export async function runExecuteStage(
  ctx: ClaimedTaskShellContext,
  commandTemplate: string,
): Promise<{ ok: true; output: string } | { ok: false }> {
  const startedAtMs = Date.now();
  let streamObs: OpencodeStreamObserver | undefined;

  const emptyRunMonitor = createEmptyRunMonitor({
    workspaceDir: ctx.taskWorkspace,
    runsDir: ctx.runsDir,
    taskId: ctx.taskId,
    attempt: ctx.taskAttempt,
    config: ctx.emptyRunConfig,
    startedAtMs,
    getStreamObs: () => streamObs,
  });

  const executor = resolveExecuteExecutor(
    ctx.task,
    commandTemplate,
    {
      getTemplateContext: ctx.tplCtx,
      runShell: ctx.runShell,
      env: ctx.env,
      onHeartbeat: ctx.heartbeat,
      shouldAbort: async () => emptyRunMonitor.check().abort,
      onStreamObserver: (obs) => {
        streamObs = obs;
      },
      enableOpencodeStream: ctx.opencodeJsonEvents,
    },
    ctx.projectConfig,
  );

  const { exit_code: execCode, output: execOut, streamObs: execStream } = await runTemplateStage(ctx, executor);
  streamObs = execStream;

  if (isEmptyRunAbort(execCode, execOut)) {
    return handleEmptyRunAbort(ctx, execOut, emptyRunMonitor.check());
  }

  if (execCode !== 0) {
    const attemptPlus1 = ctx.taskAttempt + 1;
    const healBlock = healBlockFromObserver(streamObs);
    await emitOpencodeStreamDiag(ctx.eventRepo, ctx.clock, ctx.taskId, attemptPlus1, "execute", streamObs);
    const basePrompt = basePromptForRetry(String(ctx.task.prompt ?? ""));
    await ctx.taskCommands.updateStatus(ctx.taskId, "retry", {
      attempt: attemptPlus1,
      last_error: execOut.slice(0, EXEC_OUTPUT_CAP),
      ...(healBlock ? { prompt: `${basePrompt}\n\n[opencode-heal]\n${healBlock}` } : {}),
    });
    await appendTaskFailedRetry(ctx.eventRepo, ctx.clock, ctx.taskId, attemptPlus1, "execute");
    writeExecuteStageReport(ctx.runsDir, ctx.taskId, attemptPlus1, ctx.clock(), execCode, execOut);
    return { ok: false };
  }
  const attempt = ctx.taskAttempt;
  writeExecuteStageReport(ctx.runsDir, ctx.taskId, attempt, ctx.clock(), 0, execOut);
  return { ok: true, output: execOut };
}

/** verify / ai-review 固定走 shell 模板（非 cursor-sdk） */
export function createShellStageExecutor(ctx: ClaimedTaskShellContext, commandTemplate: string) {
  return createShellTemplateExecutor({
    commandTemplate,
    getTemplateContext: ctx.tplCtx,
    runShell: ctx.runShell,
    env: ctx.env,
    onHeartbeat: ctx.heartbeat,
    enableOpencodeStream: ctx.opencodeJsonEvents,
  });
}
