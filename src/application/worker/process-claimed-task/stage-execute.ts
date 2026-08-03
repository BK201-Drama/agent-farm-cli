import { basePromptForRetry, emitOpencodeStreamDiag, healBlockFromObserver } from "../opencode-retry-diag.js";
import { detectRemediations, runRemediation, detectRateLimit, rateLimitConcurrencyWarningMsg } from "../retry-remediation.js";
import { resolveExecuteExecutor } from "../../executors/resolve-execute-executor.js";
import { createShellTemplateExecutor } from "../../executors/shell-template-executor.js";
import type { ClaimedTaskShellContext } from "./context.js";
import { appendTaskFailedRetry } from "./events.js";
import type { AgentStreamObserver } from "../../../domain/ports/agent-stream-observer.js";
import { runTemplateStage } from "./run-template-stage.js";
import { writeExecuteStageReport } from "../execute-stage-report.js";
import { EXEC_OUTPUT_CAP } from "../worker-output-limits.js";
import { createEmptyRunMonitor } from "../empty-run-monitor.js";
import { handleEmptyRunAbort, isEmptyRunAbort } from "../empty-run-action.js";
import {
  commandLooksLikeClaudeRun,
  commandLooksLikeCodexRun,
  commandLooksLikeCursorAgentRun,
  commandLooksLikeOpencodeRun,
} from "../../../infrastructure/executors/opencode-shell-runner.js";

function agentStreamEnabled(ctx: ClaimedTaskShellContext): boolean {
  return (
    ctx.opencodeJsonEvents || ctx.claudeJsonEvents || ctx.codexJsonEvents || ctx.cursorAgentJsonEvents
  );
}

function healTagForCommandTemplate(commandTemplate: string): string {
  if (commandLooksLikeCodexRun(commandTemplate)) return "codex-heal";
  if (commandLooksLikeCursorAgentRun(commandTemplate)) return "cursor-agent-heal";
  if (commandLooksLikeClaudeRun(commandTemplate)) return "claude-heal";
  if (commandLooksLikeOpencodeRun(commandTemplate)) return "opencode-heal";
  return "opencode-heal";
}

export async function runExecuteStage(
  ctx: ClaimedTaskShellContext,
  commandTemplate: string,
): Promise<{ ok: true; output: string; streamObs?: AgentStreamObserver } | { ok: false }> {
  const startedAtMs = Date.now();
  let streamObs: AgentStreamObserver | undefined;

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
      enableOpencodeStream:
        ctx.opencodeJsonEvents || ctx.claudeJsonEvents || ctx.codexJsonEvents || ctx.cursorAgentJsonEvents,
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

    // ── Pre-retry remediations (e.g. npm install) ──
    const remediations = detectRemediations(streamObs, execOut);
    for (const action of remediations) {
      const remResult = await runRemediation(action, { cwd: ctx.taskWorkspace, env: ctx.env, runShell: ctx.runShell });
      if (!remResult.ok) {
        console.error(
          `[agent-farm] remediation "${action.type}" failed (task ${ctx.taskId}): ${remResult.output.slice(0, 500)}`,
        );
      }
    }

    // ── Rate-limit warning ──
    if (detectRateLimit(streamObs, execOut)) {
      console.error(rateLimitConcurrencyWarningMsg());
      await ctx.eventRepo.append({
        ts: ctx.clock(),
        event: "task_rate_limit_warning",
        task_id: ctx.taskId,
        attempt: attemptPlus1,
      });
    }

    const basePrompt = basePromptForRetry(String(ctx.task.prompt ?? ""));
    const healTag = healTagForCommandTemplate(commandTemplate);
    await ctx.taskCommands.updateStatus(ctx.taskId, "retry", {
      attempt: attemptPlus1,
      last_error: execOut.slice(0, EXEC_OUTPUT_CAP),
      ...(healBlock ? { prompt: `${basePrompt}\n\n[${healTag}]\n${healBlock}` } : {}),
    });
    await appendTaskFailedRetry(ctx.eventRepo, ctx.clock, ctx.taskId, attemptPlus1, "execute");
    writeExecuteStageReport(ctx.runsDir, ctx.taskId, attemptPlus1, ctx.clock(), execCode, execOut);
    return { ok: false };
  }
  const attempt = ctx.taskAttempt;
  writeExecuteStageReport(ctx.runsDir, ctx.taskId, attempt, ctx.clock(), 0, execOut);
  return { ok: true, output: execOut, streamObs };
}

/** verify / ai-review 固定走 shell 模板（非 cursor-sdk） */
export function createShellStageExecutor(ctx: ClaimedTaskShellContext, commandTemplate: string) {
  return createShellTemplateExecutor({
    commandTemplate,
    getTemplateContext: ctx.tplCtx,
    runShell: ctx.runShell,
    env: ctx.env,
    onHeartbeat: ctx.heartbeat,
    enableOpencodeStream: agentStreamEnabled(ctx),
  });
}
